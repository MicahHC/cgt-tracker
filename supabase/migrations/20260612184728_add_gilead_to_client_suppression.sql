INSERT INTO cgt_abm_client_domains (domain, account_name)
VALUES ('gilead.com', 'Gilead Sciences')
ON CONFLICT (domain) DO UPDATE SET account_name = EXCLUDED.account_name;
