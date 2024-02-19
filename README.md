# Disaster Recovery Stack

## Overview

This repository contains the AWS Cloud Development Kit (CDK) code for deploying a disaster recovery stack in AWS. The stack is designed to ensure data durability and availability for a product management system through the use of AWS services such as DynamoDB, Lambda, API Gateway, AWS Backup, and EventBridge.

### The Recovery Methods that are used in this Stack:

- **Point in Time Recovery (PITR)**
- **On Demand Recovery**
- **Cross-regions Recovery**
- **Scheduled Backups**
- **Pilot Light**
- **Warm Standby**

## Features

- **DynamoDB Table**: A table named 'Product' with pay-per-request billing, point-in-time recovery, and cross-region replication in 'us-east-1'.
- **Lambda Function**: A Docker-based Lambda function ('ProductLambda') for performing CRUD operations on the DynamoDB table and creating backups.
- **AWS Backup Plan**: A plan ('DynamoDB-Backup-Plan') for creating daily backups of the 'Product' table at 9:10 AM UTC, with backups retained for 30 days.
- **EventBridge Rule**: A rule ('BackupScheduleRule') for triggering the Lambda function at 10:00 AM UTC for post-backup processes.
- **API Gateway REST API**: An API ('Product-Lambda-API') with endpoints to manage products and initiate backups.

## Usage

_ _Frist_ _: Ensure ```docker``` is running

1. **Deployment**: Use the AWS CDK CLI to deploy this stack to your AWS account.
```bash
cdk deploy DisasterRecoveryStack
```
2. **Interacting with the API**: Use the output API Gateway URL to interact with the product database. Supported operations include adding, getting, updating, and deleting products, as well as creating backups.

    _ _Adding data_ _: Either you can use Postman or Thunder Client by posting the following URL:
```
https://2l0qferg69.execute-api.us-east-2.amazonaws.com/prod/addProduct
```
And pasting the following test data into the raw JSON body
```
{
    "product_category": "Accessories",
    "product_title": "Airpods pro 2"
}
```

## Cleanup

To avoid incurring future charges, remember to delete the resources created by this stack:
```bash
cdk destroy DisasterRecoveryStack
```