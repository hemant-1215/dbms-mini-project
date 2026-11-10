INSERT INTO billing_rates(resource_type,gpu_model_name,rate_inr,effective_from) VALUES
  ('gpu_hour','H100',350.0000,'2025-01-01 00:00:00.000000'),
  ('gpu_hour','A100',220.0000,'2025-01-01 00:00:00.000000'),
  ('gpu_hour','V100',90.0000,'2025-01-01 00:00:00.000000'),
  ('gpu_hour','RTX 4090',55.0000,'2025-01-01 00:00:00.000000'),
  ('cpu_core_hour',NULL,0.7500,'2025-01-01 00:00:00.000000'),
  ('ram_gb_hour',NULL,0.1500,'2025-01-01 00:00:00.000000'),
  ('storage_gb_hour',NULL,0.0100,'2025-01-01 00:00:00.000000')
ON DUPLICATE KEY UPDATE rate_inr=VALUES(rate_inr);
