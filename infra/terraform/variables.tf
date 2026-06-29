variable "location" {
  description = "기본 리전 (대부분의 리소스)"
  type        = string
  default     = "koreacentral"
}

variable "resource_group_name" {
  type    = string
  default = "rg-scheduling-optimizer"
}

variable "postgres_admin_password" {
  description = "PostgreSQL Flexible Server 관리자 비밀번호. 절대 코드/git에 평문 저장하지 말 것. terraform.tfvars 대신 TF_VAR_postgres_admin_password 환경변수나 -var로 주입."
  type        = string
  sensitive   = true
}

variable "grafana_admin_password" {
  description = "Grafana admin 비밀번호. TF_VAR_grafana_admin_password 환경변수로 주입."
  type        = string
  sensitive   = true
}

variable "database_url" {
  description = "Backend Container App에 주입할 DATABASE_URL"
  type        = string
  sensitive   = true
}
