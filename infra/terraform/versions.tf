terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.110"
    }
  }

  # state는 우선 로컬 파일로 시작. 여러 명이 작업하게 되면
  # azurerm backend(storage account)로 옮기는 것을 권장.
  # backend "local" {}
}

provider "azurerm" {
  features {}
}
