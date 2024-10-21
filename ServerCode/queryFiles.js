const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

app.get('/files/:folder/:extension', (req, res) => {
  const folderPath = path.join(__dirname, req.params.folder); // Percorso della cartella da cui fare la query
  const extension = req.params.extension; // Estensione dei file da cercare

  fs.readdir(folderPath, (err, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Errore nella lettura della cartella' });
    }

    const filteredFiles = files.filter(file => path.extname(file) === `.${extension}`);

    res.json(filteredFiles);
  });
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server avviato sulla porta ${port}`);
});
