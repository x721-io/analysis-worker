// import { Job } from 'kue';
import { GraphQLClient } from 'graphql-request';
import {
  GetCollections1155QueryVariables,
  GetCollections721QueryVariables,
  GetNfTsSelling721QueryVariables,
  getSdk,
} from 'src/generated/graphql';
import { PrismaService } from 'src/prisma/prisma.service';
import { CONTRACT_TYPE, Prisma, TX_STATUS } from '@prisma/client';
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAME_COLLECTION } from 'src/constants/Job.constant';
import { Cron, CronExpression } from '@nestjs/schedule';
import subgraphServiceCommon from '../helper/subgraph-helper.service';
import { RedisSubscriberService } from './redis.service';
import { logger } from 'src/commons';
import { OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';
import PQueue from 'p-queue';

interface CollectionGeneral {
  totalOwner: number;
  volumn: string;
  totalNft: number;
  // floorPrice: bigint;
}

interface AnalysisObject {
  totalOwner: number;
  type: CONTRACT_TYPE;
  volume: number;
  volumeWei: string;
  totalNft: number;
  floorPrice: number;
  address: string;
  id: string;
  // floorPrice: bigint;
}

@Processor(QUEUE_NAME_COLLECTION)
export class CollectionsCheckProcessor implements OnModuleInit {
  private readonly endpoint = process.env.SUBGRAPH_URL;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisSubscriberService,
  ) {}

  private getGraphqlClient() {
    return new GraphQLClient(this.endpoint);
  }

  async onModuleInit() {
    logger.info(`call First time: QUEUE_NAME_CMS `);
    await Promise.allSettled([this.GetAnalysisCollection()]);
  }

  @Cron('00 23 * * *')
  async GetAnalysisCollection() {
    try {
      const batchSize = 100;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const listCollection = await this.prisma.collection.findMany({
          where: {
            status: 'SUCCESS',
          },
          select: {
            id: true,
            address: true,
            flagExtend: true,
            type: true,
            floorPrice: true,
            txCreationHash: true,
          },
          take: batchSize,
          skip: offset,
        });
        if (listCollection?.length > 0) {
          const analysisPromises = listCollection.map(async (item) => {
            const {
              volumn: volume,
              totalNft,
              totalOwner,
            } = await this.getGeneralCollectionData(
              item.address,
              item.type,
              item.flagExtend,
            );
            const inputAnalysis: AnalysisObject = {
              ...item,
              floorPrice: Number(item.floorPrice),
              volume: this.weiToEther(volume),
              volumeWei: `${volume}`,
              totalNft: Number(totalNft),
              totalOwner: Number(totalOwner),
            };
            return this.getAndCaculator(inputAnalysis);
          });
          await Promise.allSettled(analysisPromises);
          offset += batchSize;
        } else {
          hasMore = false;
        }
      }
      logger.info('GetAnalysisCollection successful');
    } catch (error) {
      logger.error(`getCountVolume: ${error}`);
    }
  }

  async getGeneralCollectionData(
    collectionAddress: string,
    type: CONTRACT_TYPE,
    flagExtend = false,
  ): Promise<CollectionGeneral> {
    if (!collectionAddress) {
      return {
        volumn: '0',
        totalOwner: Number(0),
        totalNft: Number(0),
        // floorPrice: BigInt(0),
      };
    }
    let totalNftExternal = 0;
    let totalOwnerExternal = 0;

    if (!!flagExtend) {
      const resultExternal =
        await subgraphServiceCommon.getAllCollectionExternal(collectionAddress);
      totalNftExternal = resultExternal.totalNftExternal;
      totalOwnerExternal = resultExternal.totalOwnerExternal;
    }

    const [statusCollection] = await Promise.all([
      subgraphServiceCommon.getCollectionCount(collectionAddress),
      // this.getVolumeCollection(collectionAddress),
    ]);

    if (type === 'ERC721') {
      return {
        volumn: statusCollection.erc721Contract?.volume || 0,
        totalOwner: !!flagExtend
          ? totalOwnerExternal
          : statusCollection.erc721Contract?.holderCount || 0,
        totalNft: !!flagExtend
          ? totalNftExternal
          : statusCollection.erc721Contract?.count || 0,
      };
    } else {
      return {
        volumn: statusCollection.erc1155Contract?.volume || 0,
        totalOwner: !!flagExtend
          ? totalOwnerExternal
          : statusCollection.erc1155Contract?.holderCount || 0,
        totalNft: !!flagExtend
          ? totalNftExternal
          : statusCollection.erc1155Contract?.count || 0,
      };
    }
  }

  async CountExternalCollection() {
    try {
      const externalCollections = await this.prisma.collection.findMany({
        where: {
          flagExtend: true,
        },
        select: {
          id: true,
          address: true,
        },
      });

      for (const collection of externalCollections) {
        const { totalNftExternal, totalOwnerExternal } =
          await subgraphServiceCommon.getAllCollectionExternal(
            collection.address,
          );
        const key = `External-${collection.address}`;
        this.redisService.set(
          `session:${key}`,
          {
            address: collection.address,
            totalNft: totalNftExternal.toString(),
            totalOwner: totalOwnerExternal.toString(),
          },
          604800,
        );
      }
      logger.info('handleExternalCollection successful');
    } catch (error) {
      logger.error(`CountExternalCollection: ${JSON.stringify(error)}`);
    }
  }

  async getAndCaculator(input: AnalysisObject) {
    try {
      const dateObj = new Date();
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // Months are 0-based
      const year = dateObj.getFullYear();

      // Combine them into the desired format "20240824"
      const formattedDate = `${day}${month}${year}`;
      const collectionId_createdAt = `${input.address.toLowerCase()}_${formattedDate}`;

      const checkExist = await this.prisma.analysisCollection.findUnique({
        where: {
          id: collectionId_createdAt,
        },
      });
      if (!checkExist) {
        await this.prisma.analysisCollection.create({
          data: {
            keyTime: formattedDate,
            id: collectionId_createdAt,
            collectionId: input.id,
            volumeWei: input.volumeWei,
            type: input.type,
            address: input.address,
            floorPrice: input.floorPrice,
            volume: input.volume,
            owner: input.totalOwner,
            items: input.totalNft,
          },
        });
      }
    } catch (error) {
      logger.error(`getAndCaculator: ${error}`);
    }
  }

  weiToEther(wei) {
    return wei / 1000000000000000000;
  }
}
