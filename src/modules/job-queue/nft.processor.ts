import { GraphQLClient } from 'graphql-request';
import {
  Get1155NfTsQueryVariables,
  Get721NfTsQueryVariables,
  getSdk,
} from 'src/generated/graphql';
import { PrismaService } from 'src/prisma/prisma.service';
import { CONTRACT_TYPE, Collection, TX_STATUS } from '@prisma/client';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { QUEUE_NAME_NFT } from 'src/constants/Job.constant';
import { Job } from 'bull';
import { NftCrawlerService, NftData } from '../nft-crawler/nft-crawler.service';
import { NotFoundException } from '@nestjs/common';
import { Metadata } from 'src/commons/types/Trait.type';

interface NftCrawlRequest {
  type: CONTRACT_TYPE;
  collectionAddress: string;
  txCreation?: string;
}
@Processor(QUEUE_NAME_NFT)
export class NFTsCheckProcessor {
  private readonly endpoint = process.env.SUBGRAPH_URL;

  constructor(
    private readonly prisma: PrismaService,
    private readonly NftCrawler: NftCrawlerService,
  ) {}

  private getGraphqlClient() {
    return new GraphQLClient(this.endpoint);
  }

  @Process('nft-create')
  private async checkNFTStatus(job: Job<any>) {
    const { txCreation: hash, type } = job.data;
    const client = this.getGraphqlClient();
    const sdk = getSdk(client);
    console.log('let see: ', hash, type);
    const variables: Get721NfTsQueryVariables | Get1155NfTsQueryVariables = {
      txCreation: hash,
    };
    try {
      if (type === 'ERC721') {
        const response = await sdk.Get721NFTs(variables);
        console.log(response);
        if (response.erc721Tokens.length > 0) {
          await this.prisma.nFT.update({
            where: {
              txCreationHash: hash,
            },
            data: {
              status: TX_STATUS.SUCCESS,
            },
          });
          return response;
        } else {
          throw new Error('NO TX FOUND YET');
        }
      } else if (type === 'ERC1155') {
        const response = await sdk.Get1155NFTs(variables);
        if (response.erc1155Tokens.length > 0) {
          await this.prisma.nFT.update({
            where: {
              txCreationHash: hash,
            },
            data: {
              status: TX_STATUS.SUCCESS,
            },
          });
          return response;
        } else {
          throw new Error('NO TX FOUND YET');
        }
      }
    } catch (err) {
      console.log(err);
      throw err;
    }
  }

  private async processAndSaveNft(input: NftData[], collection: Collection) {
    console.log(input)
    const getMetadata = Promise.all(
      input.map(async (i) => {
        try {
          const response = await fetch(i.tokenUri);
          if (!response.ok) {
            return null; // Or an appropriate value for a failed fetch
          }
          return response.json();
        } catch (error) {
          console.error('Fetch failed:');
          return null; // Or an appropriate value for a failed fetch
        }
      }),
    );
    const metadataArray: Metadata[] = await getMetadata;
    for (let i = 0; i < input.length; i++) {
      const convertToStringAttr = metadataArray[i]
        ? metadataArray[i].attributes.map((i) => {
            return {
              ...i,
              value: String(i.value),
            };
          })
        : null;
      const nftExisted = await this.prisma.nFT.findUnique({
        where: {
          id_collectionId: {
            id: input[i].tokenId.toString(),
            collectionId: collection.id,
          },
        },
      });
      console.log('is existed: ', nftExisted)
      if (!nftExisted) {
        await this.prisma.nFT.create({
          data: {
            id: input[i].tokenId.toString(),
            name: metadataArray[i].name,
            status: TX_STATUS.SUCCESS,
            tokenUri: input[i].tokenUri,
            txCreationHash: input[i].txCreation,
            collectionId: collection.id,
            ipfsHash: '',
            imageHash: metadataArray[i].image,
            Trait: {
              createMany: {
                data: convertToStringAttr,
                skipDuplicates: true,
              },
            },
          },
        });
      }
    }
  }

  @Process('nft-crawl-single')
  private async crawlNftInfoToDbSingle(job: Job<NftCrawlRequest>) {
    const { txCreation: hash, type } = job.data;
    const client = this.getGraphqlClient();
    const sdk = getSdk(client);
    console.log('let see: ', hash, type);
    const variables: Get721NfTsQueryVariables | Get1155NfTsQueryVariables = {
      txCreation: hash,
    };
    try {
      if (type === 'ERC721') {
        const { erc721Tokens } = await sdk.Get721NFTs(variables);
        console.log(erc721Tokens[0].tokenId);
        if (erc721Tokens.length > 0) {
          const collection = await this.prisma.collection.findUnique({
            where: {
              address: erc721Tokens[0].contract.id,
            },
          });
          const nftExisted = await this.prisma.nFT.findUnique({
            where: {
              id_collectionId: {
                id: erc721Tokens[0].tokenId.toString(),
                collectionId: collection.id,
              },
            },
          });
          if (!nftExisted) {
            const uri = await this.NftCrawler.getSingleErc721NftData(
              erc721Tokens[0].tokenId.toString(),
              erc721Tokens[0].contract.id,
            );
            // TODO: fetch metadata
            let metadata: Metadata;
            try {
              const response = await fetch(uri.tokenUri);
              if (!response.ok) {
                throw new Error('Metadata uri is incorrect');
              }
              metadata = (await response.json()) as Metadata;
            } catch (error) {
              console.error('Fetch failed:');
              return null; // Or an appropriate value for a failed fetch
            }
            // TODO: create nft
            await this.prisma.nFT.create({
              data: {
                id: erc721Tokens[0].tokenId.toString(),
                name: metadata.name,
                status: TX_STATUS.SUCCESS,
                tokenUri: uri.tokenUri,
                txCreationHash: hash,
                collectionId: collection.id,
                ipfsHash: '',
                imageHash: metadata.image,
                description: metadata.description,
                Trait: {
                  createMany: {
                    data: metadata.attributes.map((trait) => ({
                      ...trait,
                      value: trait.value.toString(),
                    })),
                    skipDuplicates: true,
                  },
                },
              },
            });
          }
          return erc721Tokens;
        } else {
          throw new Error('NO TX FOUND YET');
        }
      } else if (type === 'ERC1155') {
        const { erc1155Tokens } = await sdk.Get1155NFTs(variables);
        if (erc1155Tokens.length > 0) {
          console.log('ok');
          const collection = await this.prisma.collection.findUnique({
            where: {
              address: erc1155Tokens[0].contract.id,
            },
          });
          const nftExisted = await this.prisma.nFT.findUnique({
            where: {
              id_collectionId: {
                id: erc1155Tokens[0].tokenId.toString(),
                collectionId: collection.id,
              },
            },
          });
          if (!nftExisted) {
            const uri = await this.NftCrawler.getSingleErc721NftData(
              erc1155Tokens[0].tokenId.toString(),
              erc1155Tokens[0].contract.id,
            );
            // TODO: fetch metadata
            let metadata: Metadata;
            try {
              const response = await fetch(uri.tokenUri);
              if (!response.ok) {
                throw new Error('Metadata uri is incorrect');
              }
              metadata = (await response.json()) as Metadata;
            } catch (error) {
              console.error('Fetch failed:');
              return null; // Or an appropriate value for a failed fetch
            }
            // TODO: create nft
            await this.prisma.nFT.create({
              data: {
                id: erc1155Tokens[0].tokenId.toString(),
                name: metadata.name,
                status: TX_STATUS.SUCCESS,
                tokenUri: uri.tokenUri,
                txCreationHash: hash,
                collectionId: collection.id,
                ipfsHash: '',
                imageHash: metadata.image,
                description: metadata.description,
                Trait: {
                  createMany: {
                    data: metadata.attributes.map((trait) => ({
                      ...trait,
                      value: trait.value.toString(),
                    })),
                    skipDuplicates: true,
                  },
                },
              },
            });
          }
          return erc1155Tokens;
        } else {
          throw new Error('NO TX FOUND YET');
        }
      }
    } catch (err) {
      console.log(err);
      throw err;
    }
  }

  @Process('nft-crawl-collection')
  private async crawlNftInfoToDb(job: Job<NftCrawlRequest>) {
    const { type, collectionAddress } = job.data;
    const collection = await this.prisma.collection.findUnique({
      where: {
        address: collectionAddress.toLowerCase(),
      },
    });
    if (!collection) throw new NotFoundException('Collection not found');

    if (type === 'ERC1155') {
      const res = await this.NftCrawler.getAllErc1155NftData(collectionAddress);
      await this.processAndSaveNft(res, collection);
    } else {
      const res = await this.NftCrawler.getAllErc721NftData(collectionAddress);
      console.log(res);
      await this.processAndSaveNft(res, collection);
    }
  }

  // TODO: BUY SELL TRANSFER BID EVENT

  @OnQueueFailed()
  private async onNFTCreateFail(job: Job<any>, error: Error) {
    console.error(`Job failed: ${job.id} with error: ${error.message}`);
    const hash = job.data.txCreation;
    const retry = job.attemptsMade;
    try {
      if (retry >= parseInt(process.env.MAX_RETRY))
        await this.prisma.nFT.update({
          where: {
            txCreationHash: hash,
          },
          data: {
            status: TX_STATUS.FAILED,
          },
        });
      console.log(`Updated status to FAILED for txCreationHash: ${hash}`);
    } catch (prismaError) {
      console.error(
        `Error updating status in database: ${prismaError.message}`,
      );
    }
  }
}
