export async function getUser(): Promise<{ id: string; name: string }[]> {
  // Example business logic; replace with DB when added
  return [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
  ];
}
