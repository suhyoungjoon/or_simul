FROM grafana/promtail:3.0.0
COPY promtail-config.yml /etc/promtail/config.yml
ENTRYPOINT ["/usr/bin/promtail", "-config.file=/etc/promtail/config.yml"]
