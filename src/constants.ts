import type { ResourceStatics } from "./Models/Resource";
import APIGatewayV2 from "./Models/Services/APIGatewayV2";
import DyanmoDB from "./Models/Services/DynamoDB";
import EC2 from "./Models/Services/EC2";
import Lambda from "./Models/Services/Lambda";
import S3 from "./Models/Services/S3";
import SQS from "./Models/Services/SQS";
import type { Service } from "./types";

export const serviceImageSize = { width: 80, height: 80 };

export const services: Record<string, Service> = {
    "EC2": { name: 'EC2', description: 'Elastic Compute Cloud', terraformType: 'resource', providerTypes: ['aws_instance'], icon: 'serviceIcons/Res_Amazon-EC2_Instance_48.svg', image: 'serviceImages/Arch_Amazon-EC2_64.svg'},
    "S3": { name: 'S3', description: 'Simple Storage Service', terraformType: 'resource', providerTypes: ['aws_s3_bucket'], icon: 'serviceIcons/Res_Amazon-Simple-Storage-Service_S3-Standard_48.svg', image: 'serviceImages/Arch_Amazon-Simple-Storage-Service_64.svg'},
    "Lambda": { name: 'Lambda', description: 'Serverless Computing Service', terraformType: 'resource', providerTypes: ['aws_lambda_function'], icon: 'serviceIcons/Res_AWS-Lambda_Lambda-Function_48.svg', image: 'serviceImages/Arch_AWS-Lambda_64.svg'},
    "API Gateway V2": { name: 'API Gateway V2', description: 'API Gateway V2', terraformType: 'resource', providerTypes: ['aws_apigatewayv2_api'], icon: 'serviceIcons/Res_Amazon-API-Gateway_Endpoint_48.svg', image: 'serviceImages/Arch_Amazon-API-Gateway_64.svg'},
    "SQS": { name: 'SQS', description: 'Simple Queue Service', terraformType: 'resource', providerTypes: ['aws_sqs_queue'], icon: 'serviceIcons/Res_Amazon-Simple-Queue-Service_Message_48.svg', image: 'serviceImages/Arch_Amazon-Simple-Queue-Service_64.svg'},
    "DynamoDB": { name: 'DynamoDB', description: 'DynamoDB', terraformType: 'resource', providerTypes: ['aws_dynamodb_table'], icon: 'serviceIcons/Res_Amazon-DynamoDB_Table_48.svg', image: 'serviceImages/Arch_Amazon-DynamoDB_64.svg'},
}

export const resourceContainer: Record<string, ResourceStatics> = {
    'EC2': EC2,
    'S3': S3,
    "Lambda": Lambda,
    "API Gateway V2": APIGatewayV2,
    "SQS": SQS,
    "DynamoDB": DyanmoDB
}   

export const regions: string[] = [
    "us-east-1",
    "us-east-2",
    "us-west-1",
    "us-west-2",
    "ap-south-1",
    "ap-northeast-3",
    "ap-northeast-2",
    "ap-southeast-1",
    "ap-southeast-2",
    "ap-northeast-1",
    "ap-south-1",
    "ap-south-1",
    "eu-west-1",
    "eu-west-2",
    "eu-west-3",
    "eu-north-1",
    "sa-east-1"
]

export const effect = ["allow", "deny"]
