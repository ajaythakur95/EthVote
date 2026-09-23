/**
 * IPFS Service via Pinata
 * Uploads SBT metadata JSON to IPFS for immutable off-chain storage
 */
const axios = require("axios");
const FormData = require("form-data");

class IPFSService {
  constructor() {
    this.apiKey = process.env.PINATA_API_KEY;
    this.secretKey = process.env.PINATA_SECRET_KEY;
    this.gateway = process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";
    this.baseUrl = "https://api.pinata.cloud";
  }

  get headers() {
    return {
      pinata_api_key: this.apiKey,
      pinata_secret_api_key: this.secretKey,
    };
  }

  /**
   * Pin a JSON metadata object to IPFS
   * Returns the IPFS URI: ipfs://Qm...
   */
  async pinJSON(metadata, name = "ethvote-metadata") {
    if (!this.apiKey || this.apiKey === "your_pinata_api_key") {
      // Sandbox: return a mock IPFS URI
      const mockHash = `QmMock${Buffer.from(JSON.stringify(metadata)).toString("hex").slice(0, 40)}`;
      console.log(`[SANDBOX IPFS] Pinned JSON with hash: ${mockHash}`);
      return `ipfs://${mockHash}`;
    }

    try {
      const res = await axios.post(
        `${this.baseUrl}/pinning/pinJSONToIPFS`,
        {
          pinataContent: metadata,
          pinataMetadata: { name },
          pinataOptions: { cidVersion: 1 },
        },
        { headers: this.headers }
      );
      return `ipfs://${res.data.IpfsHash}`;
    } catch (error) {
      throw new Error(`IPFS pin failed: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Build and upload SBT metadata for a voter
   * Follows ERC-721 metadata standard (non-sensitive data only)
   */
  async createVoterMetadata(voter) {
    const voterId = voter.virtualVoterId || voter.epicNumber || "";
    const attributes = [
      { trait_type: "Constituency", value: voter.constituency || "National" },
      { trait_type: "Registration Path", value: voter.registrationPath || "UNKNOWN" },
      { trait_type: "Issue Date", value: new Date().toISOString().split("T")[0] },
      { trait_type: "Status", value: "ACTIVE" },
    ];
    if (voter.vidhanSabhaAC) {
      attributes.push({ trait_type: "Vidhan Sabha (AC)", value: voter.vidhanSabhaAC });
    }
    if (voter.lokSabhaPC) {
      attributes.push({ trait_type: "Lok Sabha (PC)", value: voter.lokSabhaPC });
    }
    if (voterId) {
      attributes.push({ trait_type: "Voter ID", value: voterId });
    }

    const metadata = {
      name: `EthVote Voter Identity #${voter._id}`,
      description: "Soulbound Voter Identity Token issued by EthVote. Non-transferable.",
      image: voter.documents?.photo || "ipfs://QmDefaultVoterImage",
      attributes,
    };
    return this.pinJSON(metadata, `voter-${voter._id}`);
  }

  /**
   * Upload a file buffer to IPFS
   */
  async pinFile(buffer, filename, mimeType = "application/octet-stream") {
    if (!this.apiKey || this.apiKey === "your_pinata_api_key") {
      const mockHash = `QmFileMock${Date.now()}`;
      return `ipfs://${mockHash}`;
    }

    const form = new FormData();
    form.append("file", buffer, { filename, contentType: mimeType });
    form.append("pinataMetadata", JSON.stringify({ name: filename }));

    const res = await axios.post(`${this.baseUrl}/pinning/pinFileToIPFS`, form, {
      headers: { ...this.headers, ...form.getHeaders() },
      maxBodyLength: Infinity,
    });
    return `ipfs://${res.data.IpfsHash}`;
  }

  /**
   * Convert ipfs:// URI to HTTP gateway URL for display
   */
  toGatewayURL(ipfsUri) {
    if (!ipfsUri) return null;
    return ipfsUri.replace("ipfs://", this.gateway);
  }
}

module.exports = new IPFSService();
