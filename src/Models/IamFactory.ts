import { effect } from "../constants";
import type { Property } from "../types";


export class IamFactory{

     //the badge
    static makeIamRole(roleName: string, principalService: string): Record<string, Property<any>>{

        const IamRole: Record<string, Property<any>> = {

            "name": {value: roleName, type: "string"},
            "assume_role_policy": { //states what service is allowed to assume this role
                value: {
                    "Version": {value: "2012-10-17", type: "text"},
                    "Statement": {
                        value: [
                            {
                                value:{
                                    "Sid": {value: null, type: "string"},
                                    "Effect": {value: "allow", type: "select", options: effect},
                                    "Principal": {
                                        value: {
                                            "Service": {value: principalService, type: "text"},
                                            // "AWS": {value: null, type: "string"}, //account id or arn, maybe select in future.
                                            // "Federated": {value: null, type: "select", options: ['add list of providers']}, //drop down of providers
                                            // "*": {value: "*", type: "text"}
                                        }, 
                                        type: "tags"
                                    },
                                    "Action": {value: "todo", type: "text"}
                                }, 
                                type: "tags"
                            }
                        ],
                        type: "propertyArray"
                    }
                },
                type: "tags"
            }

        }

        return IamRole;

    }

    //the doors the badge lets you go through
    public static makeIamPolicy(policyName: string, roleName: string): Record<string, Property<any>>{

        //add in dependant property on node for roleName.
        //pass in node data
        //pass in path

        
        //https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy
        const policy: Record<string, Property<any>> = { 

            "name": {value: policyName, type: "string"},
            "role": {value: `aws_iam_role.${roleName}.id`, type: "string"},    
            "policy": {
                value: {
                    "Version": {value: "2012-10-17", type: "text"},
                    "Statement": {
                        value:{
                            // "Action": {value: [], type: "stringArray"},
                            "Effect": {value: "Allow", type: "select", options: effect},
                            "*": {value: "*", type: "text"}
                        },
                        type: "tags"
                    }
                }, 
                type: "tags"
            },
            "name_prefix": {value: null, type: "string"},
            
        }

        // resource "aws_iam_role_policy" "test_policy" {
        //     name = "test_policy"
        //     role = aws_iam_role.test_role.id

        //     # Terraform's "jsonencode" function converts a
        //     # Terraform expression result to valid JSON syntax.
        //     policy = jsonencode({
        //         Version = "2012-10-17"
        //         Statement = [
        //             {
        //                 Action = [
        //                 "ec2:Describe*",
        //                 ]
        //                 Effect   = "Allow"
        //                 Resource = "*"
        //             },
        //         ]
        //     })
        // }

        return policy;

    }


}