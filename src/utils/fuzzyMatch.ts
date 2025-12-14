/**
 * Fuzzy matching для названий properties
 */

import * as levenshtein from 'fast-levenshtein';

export interface MatchResult {
  propertyId: string | null;
  similarity: number;
  matchedName: string | null;
}

/**
 * Вычисляет similarity (0-100) между двумя строками
 */
function calculateSimilarity(str1: string, str2: string): number {
  const normalized1 = str1.trim().toLowerCase();
  const normalized2 = str2.trim().toLowerCase();

  // Если строки идентичны после нормализации
  if (normalized1 === normalized2) {
    return 100;
  }

  // Вычисляем расстояние Левенштейна
  const distance = levenshtein.get(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);

  if (maxLength === 0) {
    return 100;
  }

  // Конвертируем расстояние в similarity (0-100)
  const similarity = ((maxLength - distance) / maxLength) * 100;
  return Math.round(similarity * 100) / 100; // Округляем до 2 знаков
}

/**
 * Находит лучшее совпадение для property_name среди существующих properties
 * @param propertyName - название из импорта
 * @param existingProperties - массив существующих properties { id, name }
 * @param threshold - минимальный порог similarity (по умолчанию 90)
 * @returns MatchResult с propertyId или null если не найдено
 */
export function findBestMatch(
  propertyName: string,
  existingProperties: Array<{ id: string; name: string }>,
  threshold: number = 90
): MatchResult {
  if (!propertyName || !propertyName.trim()) {
    return { propertyId: null, similarity: 0, matchedName: null };
  }

  if (existingProperties.length === 0) {
    return { propertyId: null, similarity: 0, matchedName: null };
  }

  let bestMatch: MatchResult = {
    propertyId: null,
    similarity: 0,
    matchedName: null,
  };

  for (const property of existingProperties) {
    const similarity = calculateSimilarity(propertyName, property.name);

    if (similarity > bestMatch.similarity) {
      bestMatch = {
        propertyId: property.id,
        similarity,
        matchedName: property.name,
      };
    }
  }

  // Если similarity ниже порога, считаем что совпадения нет
  if (bestMatch.similarity < threshold) {
    return { propertyId: null, similarity: bestMatch.similarity, matchedName: null };
  }

  return bestMatch;
}

/**
 * Сопоставляет массив property names с существующими properties
 * @returns Map<propertyName, propertyId | null>
 */
export function matchProperties(
  propertyNames: string[],
  existingProperties: Array<{ id: string; name: string }>,
  threshold: number = 90
): Map<string, string | null> {
  const result = new Map<string, string | null>();

  for (const propertyName of propertyNames) {
    const match = findBestMatch(propertyName, existingProperties, threshold);
    result.set(propertyName, match.propertyId);
  }

  return result;
}
