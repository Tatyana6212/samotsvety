(function (root) {
  'use strict';
  const LEVELS = [
    { name: 'Лунный сад', target: 300, moves: 16 },
    { name: 'Изумрудный грот', target: 500, moves: 17 },
    { name: 'Звёздное святилище', target: 750, moves: 18 },
    { name: 'Тропа светлячков', target: 900, moves: 18 },
    { name: 'Хрустальный ручей', target: 1100, moves: 19 },
    { name: 'Зал самоцветов', target: 1300, moves: 19 },
    { name: 'Сад лунных роз', target: 1500, moves: 20 },
    { name: 'Затонувший грот', target: 1750, moves: 20 },
    { name: 'Обсерватория звёзд', target: 2000, moves: 21 },
    { name: 'Арка вечного лета', target: 2250, moves: 21 },
    { name: 'Пещера сияния', target: 2500, moves: 22 },
    { name: 'Небесная оранжерея', target: 3000, moves: 22 },
    { name: 'Хрустальные водопады', target: 3100, moves: 23 },
    { name: 'Зал четырёх стихий', target: 3500, moves: 23 },
    { name: 'Корона хранителя', target: 4000, moves: 24 }
  ];
  function evaluateLevel(levelIndex, stageScore, movesLeft) {
    const level = LEVELS[levelIndex];
    if (!level) return 'complete';
    if (stageScore >= level.target) return levelIndex === LEVELS.length - 1 ? 'complete' : 'level-up';
    if (movesLeft <= 0) return 'game-over';
    return 'playing';
  }
  const campaign = { LEVELS, evaluateLevel };
  if (typeof module !== 'undefined' && module.exports) module.exports = campaign;
  else root.GemCampaign = campaign;
})(typeof globalThis !== 'undefined' ? globalThis : this);
