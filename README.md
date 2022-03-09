# fast_storage

An optimized key-value storage based on sqlite.

## How to use

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
const user = await storage.getList("contacts."); //return "contacts.phone1" and "contacts.phone2"
//DELETE LIST
await storage.deleteList("shop1.");
```

The variable storage is an instance of LocalStorage with:
path="./fast_storage.sqlite", tableName = "LOCAL_STORAGE".

## About

Author: Henrique Emanoel Viana, a Brazilian computer scientist, enthusiast of
web technologies, cel: +55 (41) 99999-4664. URL:
https://sites.google.com/site/henriqueemanoelviana

Improvements and suggestions are welcome!
