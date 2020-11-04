provider "aws" {
  version = "=3.13.0"
  region  = "eu-central-1"
}

data "aws_caller_identity" "current" {}

data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "allow_postgres_anywhere" {
  name        = "allow_postgres_from_anywhere"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "Postgres from anywhere"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "mia_test" {
  identifier          = "mia"
  skip_final_snapshot = true
  publicly_accessible = true
  iam_database_authentication_enabled = true
  vpc_security_group_ids = [aws_security_group.allow_postgres_anywhere.id]
  allocated_storage   = 5
  storage_type        = "standard"
  engine              = "postgres"
  engine_version      = "12.4"
  instance_class      = "db.t2.micro"
  name                = "mia"
  username            = "mia_admin"
  password            = "mia_admin"
}

data "aws_iam_policy_document" "mia_test_db_login" {
  statement {
    effect    = "Allow"
    actions   = ["rds-db:connect"]
    resources = ["arn:aws:rds-db:eu-central-1:${data.aws_caller_identity.current.account_id}:dbuser:${aws_db_instance.mia_test.identifier}/mia_test_user"]
    
  }
}

data "aws_iam_policy_document" "allow_assume_all" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      identifiers = [data.aws_caller_identity.current.account_id]
      //      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/*"]
      //      identifiers = ["*"]
      type = "AWS"
    }
  }
}

resource "aws_iam_role_policy" "mia_test_db_access" {
  policy = data.aws_iam_policy_document.mia_test_db_login.json
  role   = aws_iam_role.mia_test_db_access.id
}

resource aws_iam_role "mia_test_db_access" {
  name               = "MiaTestDbAccess"
  assume_role_policy = data.aws_iam_policy_document.allow_assume_all.json
}
