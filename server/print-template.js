module.exports.formatLabel = function (data) {
    // Sanitize inputs for tiny labels
    const name = (data.name || "").trim();
    const item = (data.item || "").trim();
    
    // --- OPTION A (best fit) ---
    return `${name}\n${item}\nMiracleCoins.com`;

    // --- OPTION B (4-line version) ---
    // return `${name}\n${item}\nMiracleCoins.com\n@MiracleCoinz`;
};
