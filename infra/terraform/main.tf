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
    # zone: Azure가 가용영역을 재배치할 수 있어 무시.
    # administrator_password: Azure API가 비밀번호 값을 절대 반환하지 않아
    # import 후 매 plan마다 "추가됨"으로 표시됨(실제 변경 아님) — 비밀번호를
    # 바꾸려면 az containerapp/az postgres 명령으로 직접 변경.
    ignore_changes = [zone, administrator_password]
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

resource "azurerm_container_app" "backend" {
  name                         = "ca-scheduling-backend"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"

  identity {
    type = "SystemAssigned"
  }

  registry {
    server   = azurerm_container_registry.acr.login_server
    identity = "system"
  }

  ingress {
    external_enabled = true
    target_port      = 8000
    transport        = "auto"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 0
    max_replicas = 1

    volume {
      name         = "logs"
      storage_type = "EmptyDir"
    }

    container {
      name   = "ca-scheduling-backend"
      image  = "acrschedulingopt.azurecr.io/scheduling-backend:latest"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "DATABASE_URL"
        value = var.database_url
      }

      volume_mounts {
        name = "logs"
        path = "/var/log/app"
      }
    }

    container {
      name   = "promtail"
      image  = "acrschedulingopt.azurecr.io/scheduling-promtail:v1"
      cpu    = 0.25
      memory = "0.5Gi"

      volume_mounts {
        name = "logs"
        path = "/var/log/app"
      }
    }
  }

  lifecycle {
    # CI/CD(.github/workflows/backend-deploy.yml)가 az containerapp update로
    # 이미지 태그를 자주 갱신한다. Terraform이 그 변경을 되돌리지 않도록 무시.
    # env(DATABASE_URL): Azure가 한번 import된 일반 env 값을 sensitive 변수로
    # 참조하면 "값이 sensitive로 재분류됨" 표시만 매번 뜨는 현상이 있어 함께 무시.
    ignore_changes = [
      template[0].container[0].image,
      template[0].container[1].image,
      template[0].container[0].env,
    ]
  }
}

resource "azurerm_container_app" "prometheus" {
  name                         = "ca-prometheus"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"

  identity {
    type = "SystemAssigned"
  }

  registry {
    server   = azurerm_container_registry.acr.login_server
    identity = "system"
  }

  ingress {
    external_enabled = false
    target_port      = 9090
    transport        = "auto"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 0
    max_replicas = 1

    container {
      name   = "ca-prometheus"
      image  = "acrschedulingopt.azurecr.io/scheduling-prometheus:v1"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }
}

resource "azurerm_container_app" "loki" {
  name                         = "ca-loki"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"

  identity {
    type = "SystemAssigned"
  }

  registry {
    server   = azurerm_container_registry.acr.login_server
    identity = "system"
  }

  ingress {
    external_enabled = false
    target_port      = 3100
    transport        = "auto"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 0
    max_replicas = 1

    container {
      name   = "ca-loki"
      image  = "acrschedulingopt.azurecr.io/scheduling-loki:v1"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }
}

resource "azurerm_container_app" "grafana" {
  name                         = "ca-grafana"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"

  identity {
    type = "SystemAssigned"
  }

  registry {
    server   = azurerm_container_registry.acr.login_server
    identity = "system"
  }

  secret {
    name  = "grafana-admin-password"
    value = var.grafana_admin_password
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    transport        = "auto"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 0
    max_replicas = 1

    container {
      name   = "ca-grafana"
      image  = "acrschedulingopt.azurecr.io/scheduling-grafana:v2"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "GF_SECURITY_ADMIN_USER"
        value = "admin"
      }

      env {
        name        = "GF_SECURITY_ADMIN_PASSWORD"
        secret_name = "grafana-admin-password"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }
}

resource "azurerm_static_web_app" "frontend" {
  name                = "swa-scheduling-optimizer"
  resource_group_name = azurerm_resource_group.main.name
  location            = "East Asia"
  sku_tier            = "Free"
  sku_size            = "Free"
}
