# fast_storage

An optimized key-value storage and cache engine based on sqlite.

## Cache options

The cache has a garbage collector that automatically deletes expired items.
However, it is possible to intercept these items by the `onDeletedByExpiration`
callback function.

### Absolute Expiration

The object in the Cache will expire on a certain date, from the moment of
insertion of the object in the Cache, regardless of its use or not. The value
`0` disables this type of expiration.

### Sliding Expiration

The object in Cache will expire after the configured time, from the last request
of the object in Cache (`get` or `set`). The value `0` disables this type of
expiration.

## How to use

### Key-value storage

```typescript
import { LocalStorage, storage } from "https://deno.land/x/fast_storage/mod.ts";
//INSERT
await storage.set("some_key", { param1: "value1" });
//this is different from (key is not object path!):
await storage.set("some_key.param1", "value1");

//GET
const res = await storage.get("some_key");

//DELETE
const res = await storage.delete("some_key2");

//GET LIST (You can define namespaces, for example: "contacts.phone1", "contacts.phone2").
await storage.set("contacts.phone1", "574937586");
await storage.set("contacts.phone2", "214837483");
const contacts = await storage.getNameSpace("contacts."); //return "contacts.phone1" and "contacts.phone2"

//DELETE LIST
await storage.deleteNameSpace("shop1.");

//GET RANGE
const users = await storage.getRange("1", "1000"); //returns all users where the key is between (including) 1 and 1000. The `start` and `end` parameters are optional, but at least one must exist.

//DELETE RANGE
await storage.deleteRange("shop1.");
//The `getNameSpace` and `getRange` methods have an optional last parameter `getKey=false`.
```

### Enable Cache engine

```typescript
/*
  public async setCacheConfigs(
    slidingExpiration: number = 0,
    absoluteExpiration: number = 0,
    onDeletedByExpiration: ((data: any) => void | Promise<void>) | undefined = undefined,
  )
*/
//slidingExpiration: 5 min
//absoluteExpiration: 30 min
storage.setCacheConfigs(
  5 * 60 * 1000,
  30 * 60 * 1000,
  (data: any) => console.log(data),
);

//NOT TO EXPIRE SPECIFIC ENTRY
//(Creates a way to use key-value storage and cache mode at the same time)
await storage.set("some_key", { param1: "value1" }, false);
```

If the cache engine is not enabled or if `slidingExpiration` and
`absoluteExpiration` are `0`, expiration is disabled. if `absoluteExpiration`
and `slidingExpiration` are greater than `0` (enabled), `absoluteExpiration`
cannot be less than `slidingExpiration`.

### Create database instances:

```typescript
/*
  constructor(
    path: string = "./fast_storage.sqlite",
    tableName: string = "LOCAL_STORAGE"
  )
*/
storage2 = new LocalStorage("./mydb2.sqlite", "LOCAL_STORAGE");
```

The variable `storage` is an instance of LocalStorage with:
path="./fast_storage.sqlite", tableName = "LOCAL_STORAGE".

## About

Author: Henrique Emanoel Viana, a Brazilian computer scientist, enthusiast of
web technologies, cel: +55 (41) 99999-4664. URL:
https://sites.google.com/view/henriqueviana

Improvements and suggestions are welcome!
