import { createHash } from 'crypto';
import GCPPCommonCommon from './GCPPCommon.common';
import { FileUpload } from './types/Fileupload.common';
import { encode } from 'punycode';
import { ApiCallerService } from 'src/modules/api-caller/api-caller.service';
import { HttpService } from '@nestjs/axios';
import logger from './Logger.common';
import { gql, GraphQLClient } from 'graphql-request';
import { CONTRACT_TYPE } from '@prisma/client';
import axios from 'axios';

type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object
      ? RecursivePartial<T[P]>
      : T[P];
};

type PrismaSelect<T> = {
  select?: RecursivePartial<T>;
};
class OtherCommon {
  apiService: ApiCallerService;

  public sortObject<T>(obj: T): T {
    const sorted = <T>{};
    const str = [];
    let key;
    for (key in obj) {
      if (obj.hasOwnProperty(key)) {
        str.push(encodeURIComponent(key));
      }
    }
    str.sort();
    for (key = 0; key < str.length; key++) {
      sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, '+');
    }
    return sorted;
  }

  async handleUploadMultipleItems(asset: Promise<FileUpload[]>, id: string) {
    try {
      if (asset && (await asset).length > 0) {
        const list = [];
        await Promise.all(
          (await asset).map(async (item) => {
            const { Location } = await GCPPCommonCommon.upload(item, id);
            list.push(Location);
          }),
        );
        return list;
      } else {
        return [];
      }
    } catch (err) {
      throw new Error(err);
    }
  }

  async handleUploadandCronJob(asset: Promise<FileUpload[]>, id: string) {
    if (asset && (await asset).length > 0) {
      const list = [];
      await Promise.all(
        (await asset).map(async (item) => {
          const { Location } = await GCPPCommonCommon.upload(item, id);
          list.push(Location);
          // run cron job here
        }),
      );
      return list;
    } else {
      return [];
    }
  }

  async handleUploadSingleItems(asset: Promise<FileUpload>, id: string) {
    try {
      if (asset) {
        const { Location } = await GCPPCommonCommon.upload(await asset, id);
        return Location;
      } else {
        return '';
      }
    } catch (err) {
      throw new Error(err);
    }
  }

  stringToSlug(title: string): string {
    let slug = title.toLowerCase();

    //Đổi ký tự có dấu thành không dấu
    slug = slug.replace(/á|à|ả|ạ|ã|ă|ắ|ằ|ẳ|ẵ|ặ|â|ấ|ầ|ẩ|ẫ|ậ/gi, 'a');
    slug = slug.replace(/é|è|ẻ|ẽ|ẹ|ê|ế|ề|ể|ễ|ệ/gi, 'e');
    slug = slug.replace(/i|í|ì|ỉ|ĩ|ị/gi, 'i');
    slug = slug.replace(/ó|ò|ỏ|õ|ọ|ô|ố|ồ|ổ|ỗ|ộ|ơ|ớ|ờ|ở|ỡ|ợ/gi, 'o');
    slug = slug.replace(/ú|ù|ủ|ũ|ụ|ư|ứ|ừ|ử|ữ|ự/gi, 'u');
    slug = slug.replace(/ý|ỳ|ỷ|ỹ|ỵ/gi, 'y');
    slug = slug.replace(/đ/gi, 'd');
    //Xóa các ký tự đặt biệt
    slug = slug.replace(
      /\`|\~|\!|\@|\#|\||\$|\%|\^|\&|\*|\(|\)|\+|\=|\,|\.|\/|\?|\>|\<|\'|\"|\:|\;|_/gi,
      '',
    );
    //Đổi khoảng trắng thành ký tự gạch ngang
    slug = slug.replace(/ /gi, '-');
    //Đổi nhiều ký tự gạch ngang liên tiếp thành 1 ký tự gạch ngang
    //Phòng trường hợp người nhập vào quá nhiều ký tự trắng
    slug = slug.replace(/\-\-\-\-\-/gi, '-');
    slug = slug.replace(/\-\-\-\-/gi, '-');
    slug = slug.replace(/\-\-\-/gi, '-');
    slug = slug.replace(/\-\-/gi, '-');
    //Xóa các ký tự gạch ngang ở đầu và cuối
    slug = '@' + slug + '@';
    slug = slug.replace(/\@\-|\-\@|\@/gi, '');
    return slug;
  }

  convertBigIntToString(obj: any): any {
    const convert = (value: any): any => {
      if (typeof value === 'bigint') {
        return value.toString();
      } else if (value instanceof Date) {
        return value;
      } else if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          return value.map(convert);
        }
        return Object.fromEntries(
          Object.entries(value).map(([key, val]) => [key, convert(val)]),
        );
      }
      return value;
    };

    return convert(obj);
  }

  generateRandomString(length: number): string {
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let randomString = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * letters.length);
      const letter = letters[randomIndex];
      randomString += letter;
    }

    return randomString;
  }

  generateRandomNumber(length: number): string {
    const letters = '0123456789';
    let randomString = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * letters.length);
      const letter = letters[randomIndex];
      randomString += letter;
    }

    return randomString;
  }

  findIntersection(ranges: number[][]): number[] {
    const validRanges = ranges.filter((range) => range.length === 2);

    if (validRanges.length < 1) {
      return [0, 0];
    }

    validRanges.sort((a, b) => a[0] - b[0]); // sort by the start of the range

    let start = validRanges[0][0];
    let end = validRanges[0][1];

    for (let i = 1; i < validRanges.length; i++) {
      if (validRanges[i][0] > end) {
        // if the start of the next range is greater than the end of the current range, no intersection exists
        return [0, 0];
      }
      start = Math.max(start, validRanges[i][0]);
      end = Math.min(end, validRanges[i][1]);
    }

    if (start > end) {
      return [0, 0];
    }
    return [start, end];
  }

  collectArrays(...arrays: any[][]): any[][] {
    return arrays;
  }

  getKeyByValue<T>(
    object: Record<keyof T, string>,
    value: string,
  ): keyof T | null {
    const keys = Object.keys(object) as Array<keyof T>;
    for (const key of keys) {
      if (object[key] === value) {
        return key;
      }
    }
    return null;
  }

  sortArrayByAbsoluteDifference(
    arr: Array<number | bigint>,
    number: number | bigint,
  ): Array<number | bigint> {
    const sortedArr = arr.slice(); // Clone the array to avoid modifying the original array
    const comparisonFunction = (a, b) => {
      const propA = typeof a === 'number' ? a : Number(a);
      const propB = typeof b === 'number' ? b : Number(b);

      const absoluteDiffA = Math.abs(propA - Number(number));
      const absoluteDiffB = Math.abs(propB - Number(number));

      return absoluteDiffA - absoluteDiffB;
    };
    sortedArr.sort(comparisonFunction);
    return sortedArr;
  }

  rearrangeObjectsArray<T>(
    objectsArray: T[],
    sortedArray: Array<number | bigint>,
    propertyToSortBy: keyof T,
  ): T[] {
    // Create a map to store the index of each value in the sorted array
    const indexMap: Map<number | bigint, number> = new Map();
    sortedArray.forEach((value, index) => indexMap.set(value, index));

    // Sort the objectsArray based on the index in the sorted array
    objectsArray.sort((a, b) => {
      const indexA = indexMap.get(a[propertyToSortBy] as number | bigint);
      const indexB = indexMap.get(b[propertyToSortBy] as number | bigint);

      return indexA - indexB;
    });

    return objectsArray;
  }

  fieldIsRequested<T>(info: any, fieldName: keyof T): boolean {
    function isFieldPresent(selectionSet: any, targetField: string): boolean {
      return selectionSet.selections.some((selection: any) => {
        if (selection.name.value === targetField) {
          return true;
        }
        if (selection.selectionSet) {
          return isFieldPresent(selection.selectionSet, targetField);
        }
        return false;
      });
    }

    return isFieldPresent(info.fieldNodes[0].selectionSet, fieldName as string);
  }

  getNormIdFromU2UId(id: string): string {
    return parseInt(
      BigInt(id)
        .toString(16)
        .substring(id.length - 24),
    ).toString();
  }
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  weiToEther(wei) {
    return wei / 1000000000000000000;
  }
}

export default new OtherCommon();
