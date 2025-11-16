// label-template.js
module.exports = (name, item) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body {
    font-family: Arial, sans-serif;
    width: 300px;
    padding: 0;
    margin: 0;
}
h1 { font-size: 22px; margin: 0; }
p { font-size: 18px; margin: 4px 0; }
</style>
</head>
<body>
<h1>${name}</h1>
<p>${item}</p>
<p>Miracle-Coins.com</p>
</body>
</html>
`;
