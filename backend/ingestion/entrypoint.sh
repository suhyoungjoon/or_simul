#!/bin/sh
set -e
python -m ingestion.orders_batch
python -m ingestion.workers_batch
