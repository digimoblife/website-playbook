-- Pemicu penjaga: entri yang diarsipkan tidak boleh terbit. Aturan ini dijaga di database
-- supaya tetap berlaku walau ada kode atau skrip yang lupa memeriksanya. Migrasi ini aditif
-- (hanya menambah pemicu) dan tidak mengubah atau menghapus data.
CREATE TRIGGER `entries_arsip_tidak_terbit_insert`
BEFORE INSERT ON `entries`
WHEN NEW.`archived_at` IS NOT NULL AND NEW.`is_published` <> 0
BEGIN
  SELECT RAISE(ABORT, 'Entri yang diarsipkan tidak boleh terbit');
END;
--> statement-breakpoint
CREATE TRIGGER `entries_arsip_tidak_terbit_update`
BEFORE UPDATE ON `entries`
WHEN NEW.`archived_at` IS NOT NULL AND NEW.`is_published` <> 0
BEGIN
  SELECT RAISE(ABORT, 'Entri yang diarsipkan tidak boleh terbit');
END;
