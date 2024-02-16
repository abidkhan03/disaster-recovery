import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AttributeType, Billing, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { join } from 'path';
import { DockerImageCode, DockerImageFunction, Function } from 'aws-cdk-lib/aws-lambda';
import { Code, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

export class DisasterRecoveryStack extends Stack {
  private readonly lambdaPath: string = join(__dirname, '../lambda')
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create the DynamoDB table
    const table = new Table(this, 'Product', {
      tableName: 'Product',
      partitionKey: {
        name: 'product_id',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      replicationRegions: ['us-east-1'],

    });

    // Create lambda Python Function
    const productLambda = new DockerImageFunction(this, 'ProductLambda', {
      functionName: 'Product-Lambda',
      code: DockerImageCode.fromImageAsset(this.lambdaPath),
      timeout: Duration.seconds(60),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const policy = new PolicyStatement({
      actions: [
        'dynamodb:PutItem',
        'dynamodb:GetItem',
        'dynamodb:DeleteItem',
        'dynamodb:Scan'
      ],
      resources: [table.tableArn],
    });

    productLambda.addToRolePolicy(policy);

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
