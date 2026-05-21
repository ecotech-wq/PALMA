-- CreateTable: métadonnées EXIF des photos (GPS, date prise de vue)
CREATE TABLE IF NOT EXISTS "PhotoMetadata" (
    "url"       TEXT NOT NULL,
    "gpsLat"    DOUBLE PRECISION,
    "gpsLng"    DOUBLE PRECISION,
    "takenAt"   TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoMetadata_pkey" PRIMARY KEY ("url")
);

CREATE INDEX IF NOT EXISTS "PhotoMetadata_gpsLat_gpsLng_idx" ON "PhotoMetadata"("gpsLat", "gpsLng");
