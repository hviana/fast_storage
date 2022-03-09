/*
Created by: Henrique Emanoel Viana
Githu: https://github.com/hviana
Page: https://sites.google.com/site/henriqueemanoelviana
cel: +55 (41) 99999-4664
*/

import { sqlite } from "./deps.ts";

export class LocalStorage {
  private path: string | undefined;
  private database: sqlite.DB;
  private tableName: string;

  constructor(
    path: string = "./fast_storage.sqlite",
    tableName: string = "LOCAL_STORAGE",
  ) {
    this.path = path;
    this.tableName = tableName;
    this.database = new sqlite.DB(this.path);
    this.database.query(
      `CREATE TABLE IF NOT EXISTS ${this.tableName} (key STRING PRIMARY KEY, value TEXT)`,
    );
  }

  public async set(key: string, value: any): Promise<void> {
    if (typeof value !== "string") {
      value = JSON.stringify(value);
    }
    this.database.query(
      `INSERT OR IGNORE INTO ${this.tableName} (key, value) VALUES (?, ?)`,
      [key, value],
    );
    this.database.query(
      `UPDATE ${this.tableName} SET value = ? WHERE key = ?`,
      [value, key],
    );
  }

  public async get(key: string) {
    for (
      var [value] of this.database.query(
        `SELECT value FROM ${this.tableName} WHERE key = ?`,
        [key],
      )
    ) {
      try {
        //@ts-ignore
        return JSON.parse(value);
      } catch (e) {
        return value;
      }
    }
  }

  public async delete(key: string): Promise<void> {
    this.database.query(
      `DELETE FROM ${this.tableName} WHERE key = ?`,
      [key],
    );
  }
  public async getList(keyStartsWith: string): Promise<any[]> {
    const res = [];
    for (
      var [value] of this.database.query(
        `SELECT value FROM ${this.tableName} WHERE key >= ? AND key < ?`,
        [keyStartsWith, this.incrementString(keyStartsWith)],
      )
    ) {
      try {
        //@ts-ignore
        res.push(JSON.parse(value));
      } catch (e) {
        res.push(value);
      }
    }
    return res;
  }
  public async deleteList(keyStartsWith: string): Promise<void> {
    this.database.query(
      `DELETE FROM ${this.tableName} WHERE key >= ? AND key < ?`,
      [keyStartsWith, this.incrementString(keyStartsWith)],
    );
  }
  incrementString(s: string) {
    return s.replace(/.$/, this.nextChar(s.slice(-1)));
  }
  nextChar(c: string) {
    return String.fromCharCode(c.charCodeAt(0) + 1);
  }
}

export const storage = new LocalStorage();
