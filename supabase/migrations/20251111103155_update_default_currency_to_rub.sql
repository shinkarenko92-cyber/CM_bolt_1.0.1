/*
  # Обновление валюты по умолчанию на RUB
  
  1. Изменения
    - Обновляем валюту по умолчанию на RUB для существующих записей в bookings
    - Это необходимо для консистентности данных после изменения дефолтной валюты
*/

UPDATE bookings SET currency = 'RUB' WHERE currency = 'EUR';
UPDATE properties SET currency = 'RUB' WHERE currency = 'EUR';