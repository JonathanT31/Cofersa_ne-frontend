-- Tabla de equivalencias de marcas.
-- Ejecutar en el SQL Editor de Supabase.

create table if not exists negociaciones_especiales.equivalencias_marcas (
    id                    bigint generated always as identity primary key,
    grupo_marca          text not null unique,  -- El valor que quiere usar el usuario
    equivalente_tabla_2  text not null,          -- El valor correcto de la base de datos
    created_at            timestamptz not null default now()
);

grant usage on schema negociaciones_especiales to anon, authenticated, service_role;
grant select, insert, update, delete on negociaciones_especiales.equivalencias_marcas to anon, authenticated, service_role;

-- ==========================================
-- OPCIONAL: Habilitar RLS (Seguridad a Nivel de Fila)
-- Por defecto, en Supabase las tablas nuevas se crean con RLS desactivado.
-- Si quieres activar RLS para esta tabla, descomenta el siguiente bloque:
--
-- alter table negociaciones_especiales.equivalencias_marcas enable row level security;
--
-- -- Permitir lectura a cualquier usuario autenticado (requerido por el frontend)
-- create policy "Permitir lectura a usuarios autenticados"
--     on negociaciones_especiales.equivalencias_marcas for select
--     to authenticated, service_role
--     using (true);
--
-- -- Permitir todas las operaciones al service_role (backend/administradores)
-- create policy "Permitir todo al service_role"
--     on negociaciones_especiales.equivalencias_marcas for all
--     to service_role
--     using (true)
--     with check (true);
-- ==========================================

-- Insertar/Actualizar equivalencias (evitando duplicados)
insert into negociaciones_especiales.equivalencias_marcas (grupo_marca, equivalente_tabla_2)
values
    ('3M', '3M'),
    ('3M eléctrico', '3M ELECTRICO'),
    ('Abracol', 'ABRA'),
    ('Aceite WD 40', 'WD 40'),
    ('Aldosa loza sanitaria', 'ALDOSA'),
    ('Amanco', 'AMANCO'),
    ('Amanco Conduit', 'AMANCO CONDU'),
    ('Apc', 'APC'),
    ('Aqua Nuova', 'AQUA'),
    ('Aqua Nuova griferia', 'AQUA GRIF'),
    ('Aquacorp', 'AQUACORP'),
    ('Arcelor', 'ARCELOR'),
    ('Asmaco', 'ASMACO'),
    ('Avtek', 'AVT'),
    ('Basic Living', 'BASIC'),
    ('Basic Living navidad', 'BL NAVIDAD'),
    ('Bekaert', 'BEKAERT'),
    ('Bellota', 'Bellota'),
    ('Bestway', 'BEST'),
    ('Bosch', 'BOSCH'),
    ('Bosch accesorios', 'BOSCH ACC'),
    ('Bosch automotriz', 'BOSCH AUTO'),
    ('Bosch medición', 'BOSCH MT'),
    ('Bosch repuestos', 'BOSCH RP'),
    ('Brochas Corona', 'Brochas Corona'),
    ('Bruder', 'BRUDER'),
    ('Bticino', 'BTICINO'),
    ('Campbell', 'CAMP'),
    ('Campbell accesorios', 'CAMPACC'),
    ('Campbell repuestos', 'RCAMPBELL'),
    ('Cato Cerámica', 'CATO'),
    ('Cintas knight', 'KNIGHT'),
    ('Coflex', 'COFL'),
    ('Coninca', 'CONI'),
    ('Daewoo', 'DAEWOO'),
    ('Decocar', 'DECOCAR'),
    ('Dexson', 'DEXSON'),
    ('Duracell', 'DURACELL'),
    ('Dyllu', 'DYLLU'),
    ('Dyllu Herr Eléctrica', 'DYLLU'),
    ('Dyllu Herr Manual', 'DYLLU'),
    ('Dyllu Hogar', 'DYLLU'),
    ('Eagle', 'EAGLE'),
    ('Ecocielos', 'ECOCIELOS'),
    ('Einhell', 'EIN'),
    ('Einhell Accesorios', 'EIN ACC'),
    ('Einhell repuestos', 'EIN RP'),
    ('Espartaco', 'ESPARTACO'),
    ('Esponja', 'ESPONJA'),
    ('Eterna', 'ETERNA'),
    ('Fanal', 'FANAL'),
    ('Fermetal', 'FERMETAL'),
    ('Fermetal fregaderos', 'FERMFRE'),
    ('FIAT', 'FIAT'),
    ('Fortimax', 'FORTIMAX'),
    ('Garabito', 'SOLQUISA'),
    ('Genérica', 'GEN'),
    ('Gines Electric', 'GINES'),
    ('Globales', 'GLOBALES'),
    ('Guateplast', 'GUATEPLAST'),
    ('Henkel', 'HENKEL'),
    ('Ilukon', 'ILUKON'),
    ('Imacasa', 'IMA'),
    ('Impac', 'IMPAC'),
    ('Imptek', 'IMPTEK'),
    ('Ipacarai', 'IPACARAI'),
    ('Klear & NIT', 'KLEAR'),
    ('Korff', 'KORF'),
    ('Lincoln accesorios', 'LINCACC'),
    ('Loctite', 'LOCT'),
    ('Lorenzetti', 'LORE'),
    ('Madera pino', 'MADERA PINO'),
    ('Maute', 'MAUTE'),
    ('Meguiars', 'MEGUIARS'),
    ('Mercantil ZL', 'MERCANTIL ZL'),
    ('Metalco', 'METALCO'),
    ('Metalco tuberias', 'METALCOTUB'),
    ('Metales Aleados', 'METALES'),
    ('Mibro', 'MIBRO'),
    ('Mipsa', 'MIPSA'),
    ('Mundorep', 'MUNDOREP'),
    ('Nakayama', 'NAKAYAMA'),
    ('National', 'STAN1'),
    ('Otros Lorenzetti', 'LORE OTROS'),
    ('PCP', 'PCP'),
    ('Perf-Ex', 'PERF-EX'),
    ('Phelps Dodge', 'CON'),
    ('Phelps Dodge Fleximax', 'CONDUCEN1'),
    ('Phelps Dodge THHN', 'CONDUCEN2'),
    ('Pinos de Occidente', 'PINOS DE OCC'),
    ('Pintura Rainbow', 'RAINBOW'),
    ('Policarbonato', 'POLI BAM'),
    ('Prostar', 'PROSTAR'),
    ('Puertas skin', 'PUERTAS SKIN'),
    ('Rali', 'RALI'),
    ('Rayovac', 'RAYOVAC'),
    ('RCA iluminación', 'RCA'),
    ('Repuestos para taller Bosch', 'RPBOSCHTA'),
    ('Rimax', 'RIMAX'),
    ('Roma', 'ROMA'),
    ('Rymco', 'RYMCO'),
    ('Schneider Electric', 'SCNE'),
    ('Segurimax', 'SEGURIMAX'),
    ('Skil', 'SKIL'),
    ('Stanley herramientas manuales', 'STAN1'),
    ('Suplijardines', 'SUPLIJARDIN'),
    ('Sur pinturas', 'SUR'),
    ('Sur Quimica', 'SUR Q'),
    ('Termoencogibles de CR', 'TERMOENCOGIB'),
    ('Tezza', 'TEZZA'),
    ('Tezza Cerrajería', 'TEZZA'),
    ('Tgv de Colombia', 'TGV'),
    ('Topaz', 'TOP'),
    ('Tubrica', 'TUBRICA'),
    ('Typsa', 'TYPS'),
    ('Unilux', 'UNILUX'),
    ('Urrea', 'URREA'),
    ('Vacmaster', 'VACMASTER'),
    ('Aqua Nuova fregaderos', 'AQUA FREG'),
    ('Dremel accesorios', 'DREMEL ACC'),
    ('Esosa', 'ESAJI'),
    ('Maderables', 'MAD ORINOCO'),
    ('Premier', 'PREMIER'),
    ('Price Pfister', 'PRIC'),
    ('Repuestos Bosch descontiuados', 'RPBOSCHDESC'),
    ('Sonaca', 'SONACA'),
    ('Stark', 'STARK'),
    ('Ternium', 'TERNIUM'),
    ('Toys', 'TOYS')
on conflict (grupo_marca) do update 
set equivalente_tabla_2 = excluded.equivalente_tabla_2;