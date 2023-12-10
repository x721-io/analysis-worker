import { Injectable } from '@nestjs/common';
import { abi as abi721 } from 'abis/ERC721Proxy.json';
import { abi as abi1155 } from 'abis/ERC1155Proxy.json';
import { ethers } from 'ethers';
import { GraphQlcallerService } from '../graph-qlcaller/graph-qlcaller.service';
import { CONTRACT_TYPE } from '@prisma/client';

export interface NftData {
  tokenId: string;
  tokenUri: string;
  contractType: CONTRACT_TYPE;
  txCreation?: string;
}
@Injectable()
export class NftCrawlerService {
  constructor(private readonly graphQl: GraphQlcallerService) {}
  private provider = new ethers.JsonRpcProvider(
    'https://rpc-nebulas-testnet.uniultra.xyz/',
  );

  async getSingleErc721NftData(
    tokenId: string,
    contractAddress: string,
  ): Promise<NftData> {
    const erc721Contract = new ethers.Contract(
      contractAddress,
      abi721,
      this.provider,
    );
    try {
      const tokenUri = await erc721Contract.tokenURI(tokenId);
      return {
        tokenId,
        tokenUri,
        contractType: 'ERC721',
      };
    } catch (err) {
      console.error('Error in ERC-721:', tokenId, err);
    }
  }
  async getSingleErc1155NftData(
    tokenId: string,
    contractAddress: string,
  ): Promise<NftData> {
    const erc1155Contract = new ethers.Contract(
      contractAddress,
      abi1155,
      this.provider,
    );
    try {
      const tokenUri = await erc1155Contract.uri(tokenId);
      return {
        tokenId,
        tokenUri,
        contractType: 'ERC1155',
      };
    } catch (err) {
      console.error('Error in ERC-1155:', tokenId, err);
    }
  }

  async getAllErc721NftData(contractAddress: string): Promise<NftData[]> {
    const erc721Contract = new ethers.Contract(
      contractAddress,
      abi721,
      this.provider,
    );
    const nfts = [];
    // const totalSupply = await this.erc721Contract.totalSupply(); // Assuming totalSupply() is available
    const { erc721Tokens } =
      await this.graphQl.getNFTFromCollection(contractAddress);
    const totalSupply = erc721Tokens.length;
    for (let tokenId = 0; tokenId < totalSupply; tokenId++) {
      try {
        const tokenUri = await erc721Contract.tokenURI(
          erc721Tokens[tokenId].tokenId,
        );
        nfts.push({
          tokenId: erc721Tokens[tokenId].tokenId,
          tokenUri,
          contractType: 'ERC721',
          txCreation: erc721Tokens[tokenId].txCreation,
        });
      } catch (error) {
        console.error('Error in ERC-721:', tokenId, error);
      }
    }
    return nfts;
  }

  async getAllErc1155NftData(contractAddress: string): Promise<NftData[]> {
    const erc1155Contract = new ethers.Contract(
      contractAddress,
      abi1155,
      this.provider,
    );
    const nfts = [];
    // const totalSupply = await this.erc721Contract.totalSupply(); // Assuming totalSupply() is available
    const { erc1155Tokens } =
      await this.graphQl.getNFTFromCollection(contractAddress);
    const totalSupply = erc1155Tokens.length;
    for (let tokenId = 0; tokenId < totalSupply; tokenId++) {
      try {
        const tokenUri = await erc1155Contract.uri(
          erc1155Tokens[tokenId].tokenId,
        );
        nfts.push({
          tokenId,
          tokenUri,
          contractType: 'ERC1155',
          txCreation: erc1155Tokens[tokenId].txCreation,
        });
      } catch (error) {
        console.error('Error in ERC-721:', tokenId, error);
      }
    }
    return nfts;
  }
}
