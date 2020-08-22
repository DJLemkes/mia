# Bran

Get a birds-eye view of your AWS account authorization structure. Quickly answer questions like:
- Who or what as access to resource S3 bucket `X`?
- What is the shortest path to read from `X` and write to `Y`?
- Which role provides access most resources?
- With whom or what should I collude to get access to data in `X`?

Currently, this is very much AWS focused. More specifically, focused at detecting which resources have access to S3 buckets using IAM roles only.

Bran uses various AWS API's to fetch your current account state. This is then ingested in a Neo4j database. You can then use the Neo4j web interface to run some of the suggested queries below.

## Running

1. Clone this repo and run `npm install`
1. Run `docker-compose up`
1. Run `node index.js` to run everything with default setting. This means that it will use the `default` profile from your `.aws/credentials` file. Besides that, it will only run for the `eu-central-1` region
1. Run `node index.js -h` to see the other options. Most notably, you can point it to different credentials and fetch data from multiple regions in one go
1. Run one of the suggested queries below

## Useful queries

Use one of the queries below to get some insights through the Neo4j web interface. Note that these queries are opitmized for this web interface meaning that they return the required results such that a nice visual graph can be rendered. Usually, you would probably not be interested in a complete path but only parts of it.

### Show all nodes of a type

Neo4j works with node labels. We use this to distinguish between AWS resources such as Role, Bucket, Policy, Lambda and so forth. To get a list of all node labels execute:

```cypher
MATCH (n) RETURN DISTINCT LABELS(n)[0]
```

To then show all nodes that have a label (e.g Role) execute:

```cypher
MATCH (r:Role) RETURN r
```

## Show which user can assume a role that provides access to a bucket

```cypher
MATCH path=(a:AWSUser)-[:CAN_ASSUME]->(r:Role)-[:HAS]->(p:Policy)-[h:HAS]->(pv:PolicyVersion)-[hp:HAS_PERMISSION]->(b:Bucket)
AND pv.isDefault
RETURN path
```

### Show all nodes that have a recently updated policy that provides access to a bucket

You can replace the label of (a) by any of the labels you've discovered above. So `(a:GlueJob)` would be another valid example.

```cypher
MATCH p=(a:AWSService)-[*]->(pv:PolicyVersion)-[hp:HAS_PERMISSION]->(b:Bucket)
WHERE hp.action = 's3GetObject' 
AND pv.isDefault 
AND b.name = 'bucket-name' 
AND pv.createdAt > datetime({year: 2020, month: 6, day: 1})
RETURN p
```

### Wipe database

You probably won't need this, but it can be useful anyway :)

```cypher
MATCH (a) DETACH DELETE a
```