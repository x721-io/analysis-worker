import { GraphQLClient } from 'graphql-request';
import { EventType } from 'src/generated/graphql';
import { PrismaService } from 'src/prisma/prisma.service';
import { Processor } from '@nestjs/bull';
import { QUEUE_NAME_CMS } from 'src/constants/Job.constant';
import { Cron } from '@nestjs/schedule';
import { logger } from 'src/commons';
import { OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import subgraphServiceCommon from '../helper/subgraph-helper.service';
import { ethers } from 'ethers';
import { RedisSubscriberService } from './redis.service';

@Processor(QUEUE_NAME_CMS)
export class CMSProcessor implements OnModuleInit {
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
    await Promise.allSettled([this.handleSummary()]);
  }

  @Cron('0 0,12 * * *')
  async callSummaryMidDay() {
    await this.handleSummary();
  }

  async handleSummary() {
    try {
      const collectionWhere: Prisma.CollectionWhereInput = {
        AND: [
          {
            status: 'SUCCESS',
          },
        ],
      };

      const nftWhere: Prisma.NFTWhereInput = {
        AND: [
          {
            status: 'SUCCESS',
          },
        ],
      };
      const [
        countCollection,
        countNFT,
        countUser,
        countTrade,
        countBid,
        countAcceptBid,
        volume721vs1155,
      ] = await Promise.all([
        this.prisma.collection.count({ where: collectionWhere }),
        this.prisma.nFT.count({ where: nftWhere }),
        this.prisma.user.count(),
        this.getCountTransaction({
          event: EventType.Trade,
        }),
        this.getCountTransaction({
          event: EventType.Bid,
        }),
        this.getCountTransaction({
          event: EventType.AcceptBid,
        }),
        this.getCountVolume(),
      ]);
      const summary = {
        countCollection,
        countNFT,
        countUser,
        countTrade,
        countAcceptBid,
        countBid,
        ...volume721vs1155,
      };
      const key = `summary-cms`;
      this.redisService.set(`session:${key}`, summary, 90000);
      logger.info(`Sync Data Summary CMS Success`);
    } catch (error) {
      logger.error(`handleSummary: ${error}`);
    }
  }

  async getCountTransaction(input: any) {
    try {
      let hasMore = true;
      const batchSize = 1000;
      let offset = 0;
      let count = 0;
      const maxConcurrentRequests = 20; // Number of concurrent requests
      const promises = [];

      while (hasMore) {
        const fetchBatch = async (currentOffset: number) => {
          const result = await subgraphServiceCommon.getSummaryTransaction(
            input.event,
            currentOffset,
            batchSize,
          );
          return result;
        };

        for (let i = 0; i < maxConcurrentRequests && hasMore; i++) {
          promises.push(fetchBatch(offset + i * batchSize));
        }

        const results = await Promise.all(promises);

        results.forEach((result) => {
          if (result && result.blocks && result.blocks.length > 0) {
            count += result.blocks.length;
          } else {
            hasMore = false;
          }
        });

        offset += batchSize * maxConcurrentRequests;
        promises.length = 0; // Clear the promises array for the next batch
      }

      return count;
    } catch (error) {
      logger.error(`getCountTransaction: ${error}`);
    }
  }

  async getCountVolume() {
    try {
      const volume721 = await subgraphServiceCommon.getSummaryVolume(
        process.env.ADDRESS_ERC721_MARKET_CONTRACT.toLowerCase(),
      );
      const volume1155 = await subgraphServiceCommon.getSummaryVolume(
        process.env.ADDRESS_ERC1155_MARKET_CONTRACT.toLowerCase(),
      );
      if (
        (volume721 && !volume721?.marketVolume) ||
        (volume1155 && !volume721?.marketVolume)
      ) {
        return {
          countVolume721: 0,
          countVolume1155: 0,
        };
      }
      const countVolume721 = parseFloat(
        ethers.utils.formatEther(volume721?.marketVolume?.totalVolume || 0),
      );
      const countVolume1155 = parseFloat(
        ethers.utils.formatEther(volume1155?.marketVolume?.totalVolume || 0),
      );

      return {
        countVolume721: isNaN(countVolume721) ? 0 : countVolume721,
        countVolume1155: isNaN(countVolume1155) ? 0 : countVolume1155,
      };
    } catch (error) {
      logger.error(`getCountVolume: ${error}`);
    }
  }
}
