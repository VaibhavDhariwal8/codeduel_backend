const axios = require("axios");

async function executeCode({
  language,
  version = "*",
  code,
  stdin = "",
  runTimeout = 3000,
}) {
  const res = await axios.post(
    `${process.env.PISTON_PROXY_URL}/api/v2/execute`,
    {
      language,
      version,
      files: [{ content: code }],
      stdin,
      run_timeout: runTimeout,
    },
    { headers: { "x-api-key": process.env.PISTON_PROXY_KEY } },
  );
  return res.data;
}
module.exports = { executeCode };
