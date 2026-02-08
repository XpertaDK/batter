-- Device registration: add status and registered_by columns

ALTER TABLE devices
    ADD COLUMN status TEXT NOT NULL DEFAULT 'disconnected'
        CHECK (status IN ('connected', 'disconnected', 'offline', 'unauthorized'));

ALTER TABLE devices
    ADD COLUMN registered_by UUID REFERENCES users(id) ON DELETE SET NULL;
