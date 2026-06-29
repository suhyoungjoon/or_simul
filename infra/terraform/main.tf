resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_container_registry" "acr" {
  name                = "acrschedulingopt"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = false
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                = "psql-scheduling-optimizer"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  version  = "16"
  zone     = "1"

  administrator_login    = "schedadmin"
  administrator_password = var.postgres_admin_password

  storage_mb            = 32768
  storage_tier          = "P4"
  auto_grow_enabled      = false

  sku_name = "B_Standard_B1ms"

  backup_retention_days        = 7
  geo_redundant_backup_enabled = false

  public_network_access_enabled = true

  lifecycle {
    ignore_changes = [zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "scheduling_optimizer" {
  name      = "scheduling_optimizer"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_all" {
  name             = "AllowAll_2026-6-28_10-37-59"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "255.255.255.255"
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = "workspace-rgschedulingoptimizer7tkl"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "main" {
  name                       = "env-scheduling-optimizer"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  # azurerm은 import 시 log_analytics_workspace_id를 API에서 다시 읽어오지 못해
  # state에 null로 남는다. ignore_changes 없이는 매 plan마다 "강제 재생성"으로
  # 표시되어 실수로 apply하면 실제 환경이 삭제+재생성될 위험이 있다.
  lifecycle {
    ignore_changes = [log_analytics_workspace_id]
  }
}
