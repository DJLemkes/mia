# Bran

Get a birds-eye view of your AWS account authorization structure. Quickly answer questions like:
- Who or what as access to resource S3 bucket `X`?
- What is the shortest path to read from `X` and write to `Y`?
- Which role provides access most resources?
- With whom or what should I collude to get access to data in `X`?

Currently, this is very much AWS focused. More specifically, focused at detecting which resources have access to S3 buckets using IAM roles only.

Bran uses various AWS API's to fetch your current account state. This is then ingested in a Neo4j database. You can then use the Neo4j web interface to run some of the suggested queries below.

## Comparing to existing AWS products

We compared Bran to existing product listing [here](https://aws.amazon.com/products/security/#AWS_Security.2C_Identity.2C_.26_Compliance_services). Conclusion is that existing products are mainly focused at response and detection, assuming that your AWS setup is correct. Bran is focused at verifying this assumption from an IAM perspective.

### AWS Config (Detection)

Continuously monitor and assess AWS *resource configurations*. Easily track changes and relate them to CloudTrail events. Bran is Config on steroids though with a focus on inter-resource relationships instead of resources themselves. Config is time oriented whereas Bran is current state oriented first. Time orientation could be added.

### AWS Detective (Incident response)

Consolidated views over Cloudtrail, VPC Flow Logs and GuardDuty findings to quickly come to the root cause of security findings or suspicious activities.

### Amazon GuardDuty (Detection)

"An intelligent threat detection service" aimed at monitoring access which are within configurations, strange in terms of behaviour (geo-location, atypical time of day, disabling audit functionality).

It uses AWS CloudTrail (including S3), VPC Flow Logs, and DNS Logs.

[Finding types](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_finding-types-active.html)

### IAM Access Analyzer (Identity & access management)

Lists external access to resources in your account. More specifically, it lists access to resources within the zone of trust of your access analyzer. Multiple analyzers can be created per account.

### AWS Security Hub (Detection)

Aggregates over GuardDuty, Macie Inspector, Firewall manager, IAM Access Analyzer and more to help prioritize and handle alerts coming out of those systems.

### Amazon Macie (Data protection)

Not applicable. Scans S3 buckets for PII and sensitive data.

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

### Check if two buckets are completely isolated from an IAM perspective

```cypher
MATCH p=(b1:Bucket)<-[:HAS_PERMISSION]-(pv1:PolicyVersion)<-[*]-(r:Role)-[*]->(pv2:PolicyVersion)-[:HAS_PERMISSION]->(b2:Bucket)
WHERE b1.name = 'yolt-dp-dta-data' AND b2.name = 'yolt-dp-dta-data-yts'
AND pv1.isDefault AND pv2.isDefault
RETURN p
```

### Show which roles are allowed to perform action X on a bucket

```cypher
MATCH p=(r:Role)-[*]->(pv:PolicyVersion)-[hp:HAS_PERMISSION]->(b:Bucket)
WHERE pv.isDefault AND 's3:GetSomeAction' =~ hp.regexAction
RETURN p
```

### Show which user can assume a role that provides access to a bucket

```cypher
MATCH path=(a:AWSUser)-[:CAN_ASSUME]->(r:Role)-[:HAS]->(p:Policy)-[h:HAS]->(pv:PolicyVersion)-[hp:HAS_PERMISSION]->(b:Bucket)
WHERE pv.isDefault
RETURN path
```

### Show all nodes that have a recently updated policy that provides access to a bucket

You can replace the label of (a) by any of the labels you've discovered above. So `(a:GlueJob)` would be another valid example.

```cypher
MATCH p=(a:AWSService)-[*]->(pv:PolicyVersion)-[hp:HAS_PERMISSION]->(b:Bucket)
WHERE pv.isDefault 
AND b.name = 'bucket-name' 
AND pv.createdAt > datetime({year: 2020, month: 6, day: 1})
RETURN p
```

### Wipe database

You probably won't need this, but it can be useful anyway :)

```cypher
MATCH (a) DETACH DELETE a
```