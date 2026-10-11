terraform {

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket       = "jamesbrass-aws-architect-sim-tfstate"
    key          = "aws-architect-simulator/terraform.tfstate" //file path in the bucket
    region       = "eu-west-2"
    use_lockfile = true   # if TF >=1.10; else add dynamodb_table = "..."
  }

}

provider "aws" {
  region  = "eu-west-2"      # pick your region
  # profile = "default"      # only needed if using a named profile ≠ default
}