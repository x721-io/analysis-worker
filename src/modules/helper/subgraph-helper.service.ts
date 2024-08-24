import { ApiCallerService } from 'src/modules/api-caller/api-caller.service';
import { CONTRACT_TYPE } from '@prisma/client';
import { gql, GraphQLClient } from 'graphql-request';
import {
  getSdk as getSdk1155,
  GetItems1155QueryVariables,
} from 'src/generated/Template1155/graphql';
import {
  getSdk as getSdk721,
  GetItems721QueryVariables,
} from 'src/generated/Template721/graphql';
import {
  getSdk as getSdkExternal,
  ErcContractExternalQuery,
  ErcContractExternalQueryVariables,
} from 'src/generated/SubgraphExternal/graphql';
import axios from 'axios';
import { logger } from 'src/commons';
import {
  CmsSummaryTransactionQueryVariables,
  ErcContractQuery,
  ErcContractQueryVariables,
  EventType,
  GetNfTsSelling1155QueryVariables,
  GetNfTsSelling721QueryVariables,
  getSdk,
} from 'src/generated/graphql';

class subgraphServiceCommon {
  apiService: ApiCallerService;
  private readonly DeadAddress = '0x000000000000000000000000000000000000dead';
  private readonly ZeroAddress = '0x0000000000000000000000000000000000000000';

  async subgraphQuery(
    url: string,
    type: CONTRACT_TYPE,
    skip: number,
    first: number,
    createdAt: number,
  ) {
    try {
      if (!url) return;
      const result =
        type == CONTRACT_TYPE.ERC1155
          ? await this.getSubgraphItems1155(url, skip, first, createdAt)
          : await this.getSubgraphItems721(url, skip, first, createdAt);
      return result;
    } catch (error) {
      // console.error(error);
      logger.error(`subgraphQuery: ${error}`);
    }
  }

  async getDetailFromIPFS(ipfsUrl: string) {
    try {
      const result = await axios.get(ipfsUrl);
      return result?.data;
    } catch (error) {
      logger.error(`getDetailFromIPFS: ${error}`);
    }
  }

  // getIpfsPath(url: string): string | null {
  //   // Create a URL object from the input string
  //   const parsedUrl = new URL(url);
  //   // Get the query parameters from the URL
  //   const params = new URLSearchParams(parsedUrl.search);
  //   // Return the value of the 'ipfsPath' parameter or null if it doesn't exist
  //   return params.get('ipfsPath') || params.get('userAddress');
  // }

  isLink(tokenURI: string) {
    // Check if the tokenURI starts with http:// or https://
    return tokenURI.startsWith('http://') || tokenURI.startsWith('https://');
  }
  async getSubgraphItems721(
    url: string,
    skip: number,
    first: number,
    createdAt: number,
  ) {
    try {
      const client = new GraphQLClient(url);
      const sdk = getSdk721(client);
      const variables: GetItems721QueryVariables = {
        skip: skip,
        first: first,
        createdAt: createdAt,
      };
      const reponse = await sdk.getItems721(variables);
      return reponse;
    } catch (error) {
      logger.error(`getSubgraphItems721: ${error}`);
    }
  }

  async getSubgraphItems1155(
    url: string,
    skip: number,
    first: number,
    createdAt: number,
  ) {
    try {
      const client = new GraphQLClient(url);
      const sdk = getSdk1155(client);
      const variables: GetItems1155QueryVariables = {
        skip: skip,
        first: first,
        createdAt: createdAt,
      };
      const reponse = await sdk.getItems1155(variables);
      return reponse;
    } catch (error) {
      logger.error(`getSubgraphItems1155: ${error}`);
    }
  }
  async getCollectionCountExternal(
    contract: string,
    page?: number,
    limit?: number,
  ): Promise<ErcContractExternalQuery> {
    const client = new GraphQLClient(
      process.env.SUBGRAPH_EXTERNAL_URL as string,
    );
    const sdk = getSdkExternal(client);
    const variables: ErcContractExternalQueryVariables = {
      contract: contract,
      page: page,
      limit: limit,
    };
    return await sdk.ErcContractExternal(variables);
  }

  async getAllCollectionExternal(contract: string) {
    try {
      let skip = 0;
      const first = 1000;
      let hasMore = true;
      let totalNftExternal = 0;
      const uniqueOwners = new Set();
      while (hasMore) {
        const resultTotalExternal = await this.getCollectionCountExternal(
          contract,
          skip,
          first,
        );
        const { erc721Tokens = [], erc1155Tokens = [] } = resultTotalExternal;
        if (erc721Tokens?.length > 0 || erc1155Tokens?.length > 0) {
          totalNftExternal += [...erc721Tokens, ...erc1155Tokens].length || 0;
          erc721Tokens.forEach((token) => {
            if (token.owner && token.owner != this.DeadAddress) {
              uniqueOwners.add(token.owner);
            }
          });
          // Process ERC-1155 tokens
          erc1155Tokens.forEach((token) => {
            token.owner.forEach((owner) => {
              if (owner.owner && owner.owner != this.DeadAddress)
                uniqueOwners.add(owner.owner);
            });
          });
          skip += first;
        } else {
          hasMore = false;
        }
      }
      return {
        totalNftExternal,
        totalOwnerExternal: uniqueOwners.size,
      };
    } catch (error) {
      console.log('getAllCollectionExternal', error);
    }
  }

  async getSummaryTransaction(
    event?: EventType,
    skip?: number,
    first?: number,
  ) {
    const client = new GraphQLClient(process.env.SUBGRAPH_URL);
    const sdk = getSdk(client);
    const variables: CmsSummaryTransactionQueryVariables = {
      event: event,
      first,
      skip,
    };
    const response = sdk.CMSSummaryTransaction(variables);
    return response;
  }

  async getSummaryVolume(address: string) {
    const client = new GraphQLClient(process.env.SUBGRAPH_URL);
    const sdk = getSdk(client);
    const response = await sdk.CMSSummaryVolume({ address: address });
    return response;
  }

  async getCollectionCount(
    collectionAddress: string,
  ): Promise<ErcContractQuery> {
    const client = new GraphQLClient(process.env.SUBGRAPH_URL);
    const sdk = getSdk(client);
    const variables: ErcContractQueryVariables = { id: collectionAddress };
    const response = sdk.ErcContract(variables);
    return response;
  }

  async getFloorPrice721(adress?: string, skip?: number, first?: number) {
    const client = new GraphQLClient(process.env.SUBGRAPH_URL);
    const sdk = getSdk(client);
    const variables: GetNfTsSelling721QueryVariables = {
      collection: adress,
      first,
      skip,
    };
    const response = sdk.GetNFTsSelling721(variables);
    return response;
  }

  async getFloorPrice1155(address?: string, skip?: number, first?: number) {
    const client = new GraphQLClient(process.env.SUBGRAPH_URL);
    const sdk = getSdk(client);
    const variables: GetNfTsSelling1155QueryVariables = {
      first,
      skip,
      collection: address,
    };
    const response = await sdk.GetNFTsSelling1155(variables);
    return response;
  }
}

export default new subgraphServiceCommon();
