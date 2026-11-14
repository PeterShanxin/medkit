CREATE INDEX github_login_expiry ON entries(json_extract(value,'$.expiresAt')) WHERE namespace='github-login';
