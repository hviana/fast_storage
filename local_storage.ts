/*
Created by: Henrique Emanoel Viana
Githu: https://github.com/hviana
Page: https://sites.google.com/view/henriqueviana
cel: +55 (41) 99999-4664
*/

export class LocalStorage {
  private path: string | undefined;
  private database: Deno.Kv;
  private timeout: number = 0;
  private onDeletedByExpiration:
    | ((data: any) => void | Promise<void>)
    | undefined = undefined;
  private slidingExpiration: number = 0;
  private absoluteExpiration: number = 0;
  constructor(
    path: string = "./fast_storage",
  ) {
    this.path = path;
  }
  public async init() {
    if (!this.database) {
      this.database = await Deno.openKv(this.path);
    }
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
    key: string | string[],
    value: any,
    expire: boolean = true,
  ): Promise<void> {
    await this.init();
    if (!Array.isArray(key)) {
      key = key.split(".");
    }
    await this.database.set(key, value);
    await this.#updateTime(key, expire);
  }

  async #updateTime(ref: string[], expire: boolean) {
    if (
      expire
    ) {
      var updated = Date.now();
      var created = await this.#getCreatedDate(ref);
      if (created === 0) {
        created = updated;
      }
      try {
        await this.database.set([...ref, "created"], created);
        await this.database.set([...ref, "updated"], updated);
      } catch (e) {
      }
      if (this.timeout === 0) {
        await this.#setValTimeout();
      }
    } else {
      await this.database.delete([...ref, "created"]);
      await this.database.delete([...ref, "updated"]);
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

  public async get(key: string | string[]) {
    await this.init();
    if (!Array.isArray(key)) {
      key = key.split(".");
    }
    const result = await this.database.get(key);
    await this.#updateTime(result.key, await this.expire(result.key));
    return result.value;
  }
  async #getCreatedDate(ref: string[]) {
    const res = await this.database.set([...ref, "created"]);
    if (!isNaN(res)) {
      return res;
    }
    return 0;
  }
  async expire(ref: string[]): Promise<boolean> {
    const res = await this.database.get([...ref, "created"]);
    return (res !== null);
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
    for (const ref of expired) {
      if (this.onDeletedByExpiration) {
        await this.onDeletedByExpiration({
          key: ref,
          data: await this.get(ref),
        });
      }
      await this.delete(ref);
    }
    await this.#setValTimeout();
  }

  public async delete(key: string | string[]): Promise<void> {
    await this.init();
    if (!Array.isArray(key)) {
      key = key.split(".");
    }
    await this.database.delete(key);
    await this.database.delete([...key, "created"]);
    await this.database.delete([...key, "updated"]);
  }
  #parseRes(key: string[], value: any, getKey: boolean = false): any {
    if (getKey) {
      return {
        key: key,
        value: value,
      };
    } else {
      return value;
    }
  }
  public async getNameSpace(
    prefix: string | string[],
    getKey: boolean = false,
  ): Promise<any[]> {
    await this.init();
    if (!Array.isArray(prefix)) {
      prefix = prefix.split(".");
    }
    const res: any[] = [];
    const entries = await this.database.list({ prefix: prefix });
    for await (const entry of entries) {
      await this.#updateTime(entry.key, await this.expire(entry.key));
      res.push(this.#parseRes(entry.key, entry.value, getKey));
    }
    return res;
  }
  public async deleteNameSpace(prefix: string | string[]): Promise<void> {
    await this.init();
    if (!Array.isArray(prefix)) {
      prefix = prefix.split(".");
    }
    const entries = await this.database.list({ prefix: prefix });
    for await (const entry of entries) {
      await this.delete(entry.key);
    }
  }
  #parseListSelectorOptions(
    prefix?: string | string[],
    start?: string | string[],
    end?: string | string[],
  ): any {
    const filters: any = {};
    if (prefix) {
      if (!Array.isArray(prefix)) {
        prefix = prefix.split(".");
      }
      filters["prefix"] = prefix;
    }
    if (start) {
      if (!Array.isArray(start)) {
        start = start.split(".");
      }
      filters["start"] = start;
    }
    if (end) {
      if (!Array.isArray(end)) {
        end = end.split(".");
      }
      filters["end"] = end;
    }
    return filters;
  }

  public async deleteRange(
    prefix?: string | string[],
    start?: string | string[],
    end?: string | string[],
  ): Promise<void> {
    await this.init();
    const filters = this.#parseListSelectorOptions(prefix, start, end);
    const res: any[] = [];
    const entries = await this.database.list(filters);
    for await (const entry of entries) {
      await this.delete(entry.key);
    }
  }
  public async getRange(
    prefix?: string | string[],
    start?: string | string[],
    end?: string | string[],
    getKey: boolean = false,
  ): Promise<any[]> {
    await this.init();
    const filters = this.#parseListSelectorOptions(prefix, start, end);
    const res: any[] = [];
    const entries = await this.database.list(filters);
    for await (const entry of entries) {
      await this.#updateTime(entry.key, await this.expire(entry.key));
      res.push(this.#parseRes(entry.key, entry.value, getKey));
    }
    return res;
  }
}

export const storage = new LocalStorage();
