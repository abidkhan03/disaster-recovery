/**
 * This stack includes:
 * - A DynamoDB table named 'Product' with pay-per-request billing mode, point-in-time recovery enabled, 
 *   and replication across the 'us-east-1' region. The table uses 'product_id' as its partition key.
 * - A Lambda function ('ProductLambda') built from a Docker image, designed to interact with the DynamoDB table. 
 *   It has permissions to perform basic CRUD operations and create backups of the DynamoDB table.
 * - A scheduled AWS Backup plan ('DynamoDB-Backup-Plan') that creates daily backups of the 'Product' table at 9:10 AM UTC, 
 *   with a retention period of 30 days.
 * - An EventBridge rule ('BackupScheduleRule') to trigger the Lambda function at 10:00 AM UTC, 
 *   presumably to handle post-backup tasks or validations.
 * - An Amazon API Gateway REST API ('Product-Lambda-API') with endpoints for adding, getting, updating, 
 *   and deleting products, and creating backups through the Lambda function.
 * - Outputs the API Gateway URL for accessing the REST API endpoints.
 * 
 * The Lambda function's environment is configured to include the DynamoDB table name, ensuring it can 
 * dynamically interact with the correct table resource. The REST API is integrated with the Lambda function 
 * to process JSON requests and responses, facilitating a serverless backend for a product management system 
 * with built-in disaster recovery capabilities.
 * 
 * Usage:
 * - Deploy this stack to an AWS account with the AWS CDK CLI.
 * - The REST API URL output can be used to interact with the product database through defined endpoints.
 * - The backup and Lambda invocation schedules ensure daily backups and potential follow-up actions without manual intervention.
 */

import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AttributeType, Billing, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { join } from 'path';
import { DockerImageCode, DockerImageFunction, Function } from 'aws-cdk-lib/aws-lambda';
import { Code, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BackupPlan, BackupPlanRule, BackupResource } from 'aws-cdk-lib/aws-backup';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';

export class DisasterRecoveryStack extends Stack {
  private readonly lambdaPath: string = join(__dirname, '../lambda')
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create the DynamoDB table
    const productTable = new Table(this, 'Product', {
      tableName: 'Product',
      partitionKey: {
        name: 'product_id',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      replicationRegions: ['us-east-1'],

    });

    // Define a backup rule
    const dailyBackupRule = new BackupPlanRule({
      ruleName: 'ProductDailyBackup',
      scheduleExpression: Schedule.cron({
        minute: '10',
        hour: '9',
      }),
      deleteAfter: Duration.days(30),
    });

    const backupPlan = new BackupPlan(this, 'BackupPlan', {
      backupPlanName: 'DynamoDB-Backup-Plan',
      backupPlanRules: [dailyBackupRule],
    });

    backupPlan.addRule(dailyBackupRule);

    backupPlan.addSelection('BackupSelection', {
      resources: [
        BackupResource.fromDynamoDbTable(productTable),
      ]
    })

    // Create lambda Python Function
    const productLambda = new DockerImageFunction(this, 'ProductLambda', {
      functionName: 'Product-Lambda',
      code: DockerImageCode.fromImageAsset(this.lambdaPath),
      timeout: Duration.seconds(60),
      environment: {
        TABLE_NAME: productTable.tableName,
      },
    });

    const policy = new PolicyStatement({
      actions: [
        'dynamodb:PutItem',
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Scan',
        'dynamodb:CreateBackup'
      ],
      resources: [productTable.tableArn],
    });

    productLambda.addToRolePolicy(policy);

    // Create backup schedule
    const backupSchedule = new Rule(this, 'BackupScheduleRule', {
      schedule: Schedule.cron({ hour: '10', minute: '0' }),
    })

    backupSchedule.addTarget(new LambdaFunction(productLambda));

    // Create rest api
    const restApi = new RestApi(this, 'Product-Lambda-API', {
      restApiName: 'Product-Lambda-API',
    });

    // Create rest api resource
    const getIntegration = new LambdaIntegration(productLambda, {
      requestParameters: {
        'integration.request.header.Content-Type': "'application/json'",
      },
      requestTemplates: {
        "application/json": '{ "body": "$input.json(`$`)"}'
      }
    });

    // Add product resource in rest api
    const addProduct = restApi.root.addResource('addProduct');
    addProduct.addMethod('POST', getIntegration, {
      requestParameters: {
        'method.request.querystring.product_category': false,
        'method.request.querystring.product_title': false,
      }
    });

    // Get a product resource
    const getProduct = restApi.root.addResource('getProduct');
    getProduct.addMethod('GET', getIntegration, {
      requestParameters: {
        'method.request.querystring.product_id': false,
      }
    });

    // Get all products resource
    const getProducts = restApi.root.addResource('getProducts');
    getProducts.addMethod('GET', getIntegration);

    // Update a product resource
    const updateProduct = restApi.root.addResource('updateProduct');
    updateProduct.addMethod('PUT', getIntegration, {
      requestParameters: {
        'method.request.querystring.product_id': false,
        'method.request.querystring.product_category': false,
        'method.request.querystring.product_title': false,
      }
    });

    // Delete a product resource
    const deleteProduct = restApi.root.addResource('deleteProduct');
    deleteProduct.addMethod('DELETE', getIntegration, {
      requestParameters: {
        'method.request.querystring.product_id': false,
      }
    });

    // Create backup resource
    const createBackup = restApi.root.addResource('createBackup');
    createBackup.addMethod('POST', getIntegration, {});

    // Grant invoke permission
    productLambda.grantInvoke(
      new ServicePrincipal('apigateway.amazonaws.com')
    );

    // Output the API gateway url
    new CfnOutput(this, 'API_URL', {
      value: restApi.url
    });
  }
}
