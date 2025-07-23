const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const CERT_PATH = path.join(__dirname, "certs");
const cert = fs.readFileSync(path.join(CERT_PATH, "cert.cer"));
const key = fs.readFileSync(path.join(CERT_PATH, "api.key"));
const ca = fs.readFileSync(path.join(CERT_PATH, "ca-homolog-sicredi.pem"));

const SICREDI_API = "https://api-pix-h.sicredi.com.br/api/v2";
const SICREDI_TOKEN_URL = "https://api-pix-h.sicredi.com.br/oauth/token";
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PIX_KEY = process.env.PIX_KEY;

async function obterToken() {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const response = await axios.post(
    SICREDI_TOKEN_URL,
    "grant_type=client_credentials&scope=cob.write+cob.read",
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      httpsAgent: new https.Agent({ cert, key, ca }),
    }
  );
  return response.data.access_token;
}

app.post("/gerar-pix", async (req, res) => {
  try {
    const { nome, cpf, valor, chave_pix, descricao } = req.body;
    const token = await obterToken();

    const payload = {
      calendario: { expiracao: 3600 },
      devedor: { cpf, nome },
      valor: { original: parseFloat(valor).toFixed(2) },
      chave: chave_pix || PIX_KEY,
      solicitacaoPagador: descricao || "Pagamento via PIX",
    };

    const response = await axios.post(
      `${SICREDI_API}/cob`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        httpsAgent: new https.Agent({ cert, key, ca }),
      }
    );

    const { txid } = response.data;
    const cobranca = await axios.get(`${SICREDI_API}/cob/${txid}`, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: new https.Agent({ cert, key, ca }),
    });

    res.json({
      txid,
      pixCopiaECola: cobranca.data.pixCopiaECola,
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ erro: "Falha ao gerar cobranca PIX" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
