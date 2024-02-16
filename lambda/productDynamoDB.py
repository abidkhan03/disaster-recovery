import boto3
import json
import decimal
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError
import uuid
import sys
from datetime import datetime
from jsonschema import validate, ValidationError
import os


product_schema = {
    "type": "object",
    "properties": {
        "product_category": {
            "type": "string"
        },
        "product_title": {
            "type": "string"
        }
    },
    "required": ["product_category", "product_title"]
}


# Identify the profile to use for this session
session = boto3.Session()

# Acquire DynamoDB resource
dynamodb = session.resource('dynamodb')

table = os.environ['TABLE_NAME']

# Table
productTable = dynamodb.Table(table)

# Helper class to convert a DynamoDB item to JSON.
# The DecimalEncoder class is used to print out numbers stored using the
# Decimal class. The Boto SDK uses the Decimal class to hold
# Amazon DynamoDB number values.
# https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GettingStarted.Python.03.html


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, decimal.Decimal):
            if o % 1 > 0:
                return float(o)
            else:
                return int(o)
        return super(DecimalEncoder, self).default(o)


# Get Products
def get_products(limit=100, lastEvaluatedKey=None):
    print("Reading all available products")

    if lastEvaluatedKey is None:
        # returns the first page
        response = productTable.scan(Limit=limit)
    else:
        # continue from previous page
        response = productTable.scan(
            Limit=limit, ExclusiveStartKey=lastEvaluatedKey)

    result = {}

    if 'LastEvaluatedKey' in response:
        result['LastEvaluatedKey'] = response['LastEvaluatedKey']

    result['Items'] = response['Items']

    return result


# Get a specific product
def get_product(productId):
    print(f"Reading product with Id:{productId}")

    response = productTable.get_item(Key={
        'product_id': productId
    })

    print(json.dumps(response['Item'], indent=4, cls=DecimalEncoder))

    return response['Item']


# add a product
def add_product(productDetail):
    '''
    Template - product_id is auto generated
    {
        "product_category": "computer",
        "product_title": "Ergo Mouse"
    }
    '''
    # Validate the product detail against the schema
    try:
        validate(instance=productDetail, schema=product_schema)

    except ValidationError as err:
        print(f'Validation Error: {err.message}')
        raise err

    # a best practice in DynamoDB is to use a random value
    # for partition key - it ensures items are distributed evenly
    # across available partitions
    # uuid is a unique id generator

    uniqueID = str(uuid.uuid4())
    print(f'Adding Item with product id {uniqueID}, {productDetail}')

    response = productTable.put_item(
        Item={
            'product_id': uniqueID,
            'product_category': productDetail['product_category'],
            'product_title': productDetail['product_title'],
            'sum_rating': decimal.Decimal(0),
            'count_rating': decimal.Decimal(0)
        })

    return uniqueID


# JSON schema for product update validation
update_product_schema = {
    "type": "object",
    "properties": {
        "product_id": {"type": "string"},
        "product_category": {"type": "string"},
        "product_title": {"type": "string"}
    },
    "required": ["product_id", "product_category", "product_title"]
}

# update a product


def update_product(productDetail):
    '''
    Template
    {
        "product_id" : "uuid of the product"
        "product_category": "updated category",
        "product_title": "updated title"
    }
    '''
    print(f'Updating Item with product id {productDetail["product_id"]}')

    # Validate the product detail against the schema
    try:
        validate(instance=productDetail, schema=update_product_schema)

    except ValidationError as err:
        print(f'Validation Error: {err.message}')
        raise err

    response = productTable.update_item(
        Key={
            'product_id': productDetail['product_id']
        },
        UpdateExpression="set product_category = :category, product_title = :title",
        ExpressionAttributeValues={
            ':category': productDetail["product_category"],
            ':title': productDetail["product_title"]},
        ConditionExpression='attribute_exists(product_id)',
        ReturnValues="NONE")

    return productDetail['product_id']

# delete a product


def delete_product(productId):
    print(f"Deleting product: {productId}")

    response = productTable.delete_item(Key={
        'product_id': productId
    })

    print(json.dumps(response, indent=4, cls=DecimalEncoder))
    return productId


def lambda_handler(event, context):
    try:
        http_method = event['httpMethod']
        path = event['path']

        if http_method == 'GET' and path == '/getProducts':
            # Handle get all products
            return {
                'statusCode': 200,
                'body': json.dumps(get_products(), cls=DecimalEncoder),
                'headers': {
                    'Content-Type': 'application/json'
                }
            }

        elif http_method == 'GET' and path == '/getProduct':
            # Handle get a specific product
            product_id = event['queryStringParameters']['product_id']
            return {
                'statusCode': 200,
                'body': json.dumps(get_product(product_id), cls=DecimalEncoder),
                'headers': {
                    'Content-Type': 'application/json'
                }
            }

        elif http_method == 'POST' and path == '/addProduct':
            # Handle add a product
            product_detail = json.loads(event['body'])
            product_id = add_product(product_detail)
            return {
                'statusCode': 201,
                'body': json.dumps({'product_id': product_id}),
                'headers': {
                    'Content-Type': 'application/json'
                }
            }

        elif http_method == 'PUT' and path == '/updateProduct':
            # Handle update a product
            product_detail = json.loads(event['body'])
            update_product(product_detail)
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'Product updated'}),
                'headers': {
                    'Content-Type': 'application/json'
                }
            }

        elif http_method == 'DELETE' and path == '/deleteProduct':
            # Handle delete a product
            product_id = event['queryStringParameters']['product_id']
            delete_product(product_id)
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'Product deleted'}),
                'headers': {
                    'Content-Type': 'application/json'
                }
            }

        else:
            return {
                'statusCode': 400,
                'body': json.dumps({'message': 'Bad request'}),
                'headers': {
                    'Content-Type': 'application/json'
                }
            }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)}),
            'headers': {
                'Content-Type': 'application/json'
            }
        }
