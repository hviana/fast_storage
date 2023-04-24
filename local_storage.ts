/*
Created by: Henrique Emanoel Viana
Githu: https://github.com/hviana
Page: https://sites.google.com/view/henriqueviana
cel: +55 (41) 99999-4664
*/

import { sqlite } from "./deps.ts";

export class LocalStorage {
  private path: string | undefined;
  private database: sqlite.DB;
  private tableName: string;
  private timeout: number = 0;
  private onDeletedByExpiration:
    | ((data: any) => void | Promise<void>)
    | undefined = undefined;
  private slidingExpiration: number = 0;
  private absoluteExpiration: number = 0;
  constructor(
    path: string = "./fast_storage.sqlite",
    tableName: string = "LOCAL_STORAGE",
  ) {
    this.path = path;
    this.tableName = tableName;
    this.database = new sqlite.DB(this.path);
    this.database.query(
      `CREATE TABLE IF NOT EXISTS ${this.tableName} (key STRING UNIQUE PRIMARY KEY, value TEXT);`,
    );
    this.database.query(
      `CREATE TABLE IF NOT EXISTS ${this.tableName}_timestamp (ref STRING UNIQUE NOT NULL, created INTEGER, updated INTEGER,
        CONSTRAINT fk_ref
        FOREIGN KEY (ref)
        REFERENCES ${this.tableName} (key)
        ON DELETE CASCADE);
      `,
    );
    this.database.query(
      `CREATE INDEX IF NOT EXISTS created_idx
       ON ${this.tableName}_timestamp (created);`,
    );
    this.database.query(
      `CREATE INDEX IF NOT EXISTS updated_idx
       ON ${this.tableName}_timestamp (updated);`,
    );
  }

  public async setCacheConfigs(
    slidingExpiration: number = 0,
    absoluteExpiration: number = 0,
    onDeletedByExpiration: ((data: any) => void | Promise<void>) | undefined =
      undefined,
  ) {
    if (absoluteExpiration > 0 && slidingExpiration > 0) {
      if (absoluteExpiration < slidingExpiration) {
        throw new Error(
          "Absolute Expiration cannot be less than Sliding Expiration.",
        );
      }
    }
    this.onDeletedByExpiration = onDeletedByExpiration;
    this.slidingExpiration = slidingExpiration;
    this.absoluteExpiration = absoluteExpiration;
    await this.#setValTimeout();
  }

  public async set(
    key: string,
    value: any,
    expire: boolean = true,
  ): Promise<void> {
    if (typeof value !== "string") {
      value = JSON.stringify(value);
    }
    this.database.query(
      `INSERT OR IGNORE INTO ${this.tableName} (key, value) VALUES (?, ?)`,
      [key, value],
    );
    this.database.query(
      `UPDATE OR IGNORE ${this.tableName} SET value = ? WHERE key = ?`,
      [value, key],
    );
    await this.#updateTime(key, expire);
  }

  async #updateTime(ref: string, expire: boolean) {
    if (
      expire
    ) {
      var updated = Date.now();
      var created = await this.#getCreatedDate(ref);
      if (created === 0) {
        created = updated;
      }
      try {
        this.database.query(
          `INSERT OR IGNORE INTO ${this.tableName}_timestamp (ref, created, updated) VALUES (?, ?, ?)`,
          [ref, created, updated],
        );
        this.database.query(
          `UPDATE OR IGNORE ${this.tableName}_timestamp SET created = ?, updated = ? WHERE ref = ?`,
          [created, updated, ref],
        );
      } catch (e) {
      }
      if (this.timeout === 0) {
        await this.#setValTimeout();
      }
    } else {
      this.database.query(
        `DELETE FROM ${this.tableName}_timestamp WHERE ref = ?`,
        [ref],
      );
    }
  }

  async #setValTimeout() {
    const [minCreated, minUpdated] = await this.#getFirstTimeToDelete();
    var newNextTime = 0;
    if (minUpdated > 0) {
      newNextTime = minUpdated + this.slidingExpiration;
    }
    if (minCreated > 0) {
      const candidateNewNextTime = minCreated + this.absoluteExpiration;
      if (candidateNewNextTime < newNextTime || (newNextTime === 0)) {
        newNextTime = candidateNewNextTime;
      }
    }
    if (newNextTime > 0) {
      var timeoutInterval = newNextTime - Date.now();
      if (timeoutInterval < 0) {
        timeoutInterval = 0;
      }
      clearTimeout(this.timeout);
      this.timeout = setTimeout(async () => {
        await this.#deleteExpired();
      }, timeoutInterval);
    } else {
      this.timeout = 0;
    }
  }

  async #getFirstTimeToDelete(): Promise<[number, number]> {
    var minCreated: number = 0;
    var minUpdated: number = 0;
    if (this.absoluteExpiration > 0) {
      for (
        var [value] of this.database.query(
          `SELECT min(created) FROM ${this.tableName}_timestamp;`,
        )
      ) {
        const resCandidate = parseInt(value as string);
        if (!isNaN(resCandidate)) {
          minCreated = resCandidate;
        }
      }
    }
    if (this.slidingExpiration > 0) {
      for (
        var [value] of this.database.query(
          `SELECT min(updated) FROM ${this.tableName}_timestamp;`,
        )
      ) {
        const resCandidate = parseInt(value as string);
        if (!isNaN(resCandidate)) {
          minUpdated = resCandidate;
        }
      }
    }
    return [minCreated, minUpdated];
  }

  public async get(key: string) {
    for (
      var [value] of this.database.query(
        `SELECT value FROM ${this.tableName} WHERE key = ?`,
        [key],
      )
    ) {
      await this.#updateTime(key, await this.expire(key));
      return this.#parseRes("", value as string, false);
    }
  }
  async #getCreatedDate(ref: string) {
    for (
      var [value] of this.database.query(
        `SELECT created FROM ${this.tableName}_timestamp WHERE ref = ?`,
        [ref],
      )
    ) {
      const res = parseInt(value as string);
      if (!isNaN(res)) {
        return res;
      }
    }
    return 0;
  }
  async expire(ref: string): Promise<boolean> {
    const expired: string[] = [];
    for (
      var [existingRef] of this.database.query(
        `SELECT ref FROM ${this.tableName}_timestamp WHERE ref = ?;`,
        [ref],
      )
    ) {
      expired.push(existingRef as string);
    }
    return expired.length > 0;
  }
  async getExpired(): Promise<string[]> {
    const expired: string[] = [];
    const now = Date.now();
    if (this.slidingExpiration > 0) {
      for (
        var [ref] of this.database.query(
          `SELECT ref FROM ${this.tableName}_timestamp WHERE (updated <= ?);`,
          [now - this.slidingExpiration],
        )
      ) {
        expired.push(ref as string);
      }
    }
    if (this.absoluteExpiration > 0) {
      for (
        var [ref] of this.database.query(
          `SELECT ref FROM ${this.tableName}_timestamp WHERE (created <= ?);`,
          [now - this.absoluteExpiration],
        )
      ) {
        expired.push(ref as string);
      }
    }
    return expired;
  }
  async #deleteExpired(): Promise<void> {
    const expired: string[] = await this.getExpired();
    const callBackData: any[] = [];
    var expiredStr: string = "";
    for (const ref of expired) {
      if (this.onDeletedByExpiration) {
        callBackData.push({ key: ref, data: await this.get(ref) });
      }
      expiredStr += `'${ref}'` + ",";
    }
    if (expired.length > 0) {
      this.database.query(
        `DELETE FROM ${this.tableName} WHERE key in (${
          expiredStr.slice(0, -1)
        })`,
      );
      if (this.onDeletedByExpiration) {
        for (const data of callBackData) {
          await this.onDeletedByExpiration(data);
        }
      }
    }
    await this.#setValTimeout();
  }

  public async delete(key: string): Promise<void> {
    this.database.query(
      `DELETE FROM ${this.tableName} WHERE key = ?`,
      [key],
    );
  }
  #parseRes(key: string, value: string, getKey: boolean = false): any {
    var parsedValue: any = undefined;
    try {
      //@ts-ignore
      parsedValue = JSON.parse(value);
    } catch (e) {
      parsedValue = value;
    }
    if (getKey) {
      return {
        key: key,
        value: parsedValue,
      };
    } else {
      return parsedValue;
    }
  }
  public async getNameSpace(
    keyStartsWith: string,
    getKey: boolean = false,
  ): Promise<any[]> {
    const res: any[] = [];
    for (
      var [key, value] of this.database.query(
        `SELECT key, value FROM ${this.tableName} WHERE key >= ? AND key < ?`,
        [keyStartsWith, this.#incrementString(keyStartsWith)],
      )
    ) {
      await this.#updateTime(key, await this.expire(key));
      res.push(this.#parseRes(key as string, value as string, getKey));
    }
    return res;
  }
  public async deleteNameSpace(keyStartsWith: string): Promise<void> {
    this.database.query(
      `DELETE FROM ${this.tableName} WHERE key >= ? AND key < ?`,
      [keyStartsWith, this.#incrementString(keyStartsWith)],
    );
  }
  #mountRangeQuery(
    initial: string,
    start?: string,
    end?: string,
  ): [string, string[]] {
    var query: [string, string[]] = [
      initial,
      [],
    ];
    if (start) {
      query[0] += `key >= ? `;
      query[1].push(start);
      if (end) {
        query[0] += `AND `;
      }
    }
    if (end) {
      query[0] += `key <= ? `;
      query[1].push(end);
    }
    return query;
  }
  public async deleteRange(start?: string, end?: string): Promise<void> {
    var query: [string, string[]] = this.#mountRangeQuery(
      `DELETE FROM ${this.tableName} WHERE `,
      start,
      end,
    );
    this.database.query(query[0], query[1]);
  }
  public async getRange(
    start?: string,
    end?: string,
    getKey: boolean = false,
  ): Promise<any[]> {
    var query: [string, string[]] = this.#mountRangeQuery(
      `SELECT key, value FROM ${this.tableName} WHERE `,
      start,
      end,
    );
    const res: any[] = [];
    for (
      var [key, value] of this.database.query(query[0], query[1])
    ) {
      await this.#updateTime(key, await this.expire(key));
      res.push(this.#parseRes(key as string, value as string, getKey));
    }
    return res;
  }
  #incrementString(s: string) {
    return s.replace(/.$/, this.#nextChar(s.slice(-1)));
  }
  #nextChar(c: string) {
    return String.fromCharCode(c.charCodeAt(0) + 1);
  }
}

export const storage = new LocalStorage();
