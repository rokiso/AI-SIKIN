export function assertLocalDevelopmentDatabase(connectionString: string): void {
  const url = new URL(connectionString);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !["/sikin_dev", "/sikin_test"].includes(url.pathname) ||
    url.port !== "55432" ||
    url.search !== ""
  ) {
    throw new Error(
      "This command only supports the isolated local sikin_dev/sikin_test database on port 55432",
    );
  }
}
