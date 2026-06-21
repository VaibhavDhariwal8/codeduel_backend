const { io } = require("socket.io-client");

const socket = io("http://localhost:4000", {
  auth: {
    token:
      "eyJhbGciOiJFUzI1NiIsImtpZCI6IjBmN2IxOThhLTkzMTgtNDg2NS04ZTBiLWY4M2M4ZTdiZjYzMCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2RwaHhpaXZ5eGp3aHhzYXl4cHRxLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI1ZTNlNzlkNS0yMGU5LTQ1Y2UtOGJiNy1kOWMwMTBkODg3YjMiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzgyMDM5Nzk0LCJpYXQiOjE3ODIwMzYxOTQsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiNWUzZTc5ZDUtMjBlOS00NWNlLThiYjctZDljMDEwZDg4N2IzIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3ODIwMzYxOTR9XSwic2Vzc2lvbl9pZCI6ImNkMWYwNzk2LWFmYmEtNDhiZS1iOTkyLTU0M2UwNzA1NjI1YyIsImlzX2Fub255bW91cyI6ZmFsc2V9.YWxzg7JQB7kK339KIEx83ueFYdFVZ1BPkBBGQFSPh0g42FbvZqw8HptNZtJBsJPoLynr3q1ijM8BjiO6iLNMmg",
  },
});

socket.on("connect", () => {
  console.log("connected!");
});

socket.on("connect_error", (err) => {
  console.log("rejected:", err.message);
});
