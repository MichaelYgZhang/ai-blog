const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 缓存文件路径
const CACHE_FILE = path.join(__dirname, '../data/published-news-cache.json');

/**
 * 生成新闻指纹（用于去重）
 * 优先使用URL，如果URL不存在则使用标题
 */
function generateFingerprint(newsItem) {
  if (newsItem.url && newsItem.url.trim() !== '') {
    return crypto.createHash('md5').update(newsItem.url.trim()).digest('hex');
  }

  // 标准化标题：转小写、去除特殊字符、去除空格
  const normalizedTitle = newsItem.title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]/g, '')
    .trim();

  return crypto.createHash('md5').update(normalizedTitle).digest('hex');
}

/**
 * 加载已发布新闻缓存
 */
function loadPublishedCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    return {
      records: {},
      lastCleanup: new Date().toISOString().split('T')[0]
    };
  }

  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch (e) {
    console.error('⚠️ 读取缓存失败，将创建新缓存:', e.message);
    return {
      records: {},
      lastCleanup: new Date().toISOString().split('T')[0]
    };
  }
}

/**
 * 保存缓存
 */
function savePublishedCache(cache) {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * 清理7天前的记录
 */
function cleanupOldRecords(cache, dateInfo) {
  const currentDate = new Date(dateInfo.year, parseInt(dateInfo.month) - 1, parseInt(dateInfo.day));
  const sevenDaysAgo = new Date(currentDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const minDateStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;

  let cleanedCount = 0;
  Object.keys(cache.records).forEach(fingerprint => {
    const record = cache.records[fingerprint];
    if (record.publishDate < minDateStr) {
      delete cache.records[fingerprint];
      cleanedCount++;
    }
  });

  if (cleanedCount > 0) {
    console.log(`🧹 清理了 ${cleanedCount} 条过期缓存记录（${minDateStr} 之前）`);
  }

  cache.lastCleanup = dateInfo.dateStr;
  return cache;
}

/**
 * 检查新闻是否已发布
 */
function isAlreadyPublished(newsItem, cache) {
  const fingerprint = generateFingerprint(newsItem);
  return fingerprint in cache.records;
}

/**
 * 标记新闻为已发布
 */
function markAsPublished(newsItem, dateInfo, cache) {
  const fingerprint = generateFingerprint(newsItem);
  cache.records[fingerprint] = {
    title: newsItem.title,
    url: newsItem.url || '',
    publishDate: dateInfo.dateStr,
    source: newsItem.source || ''
  };
}

/**
 * 主去重函数
 * @param {Object} newsData - 新闻数据对象，包含多个分类
 * @param {Object} dateInfo - 日期信息
 * @returns {Object} 去重后的新闻数据
 */
function deduplicateNews(newsData, dateInfo) {
  // 加载缓存
  let cache = loadPublishedCache();

  // 清理过期记录
  cache = cleanupOldRecords(cache, dateInfo);

  let totalBefore = 0;
  let totalAfter = 0;
  let duplicateCount = 0;

  // 对每个分类进行去重
  Object.keys(newsData).forEach(category => {
    if (!Array.isArray(newsData[category])) {
      return;
    }

    const beforeCount = newsData[category].length;
    totalBefore += beforeCount;

    newsData[category] = newsData[category].filter(item => {
      if (isAlreadyPublished(item, cache)) {
        duplicateCount++;
        console.log(`  🔄 去重: ${item.title.substring(0, 50)}...`);
        return false;
      }

      // 标记为已发布
      markAsPublished(item, dateInfo, cache);
      return true;
    });

    const afterCount = newsData[category].length;
    totalAfter += afterCount;

    if (beforeCount !== afterCount) {
      console.log(`  📁 ${category}: ${beforeCount} → ${afterCount} (去除 ${beforeCount - afterCount} 条重复)`);
    }
  });

  // 保存更新后的缓存
  savePublishedCache(cache);

  console.log(`✅ 去重完成: ${totalBefore} → ${totalAfter} (共去除 ${duplicateCount} 条重复)`);

  return newsData;
}

module.exports = {
  deduplicateNews,
  generateFingerprint,
  loadPublishedCache,
  savePublishedCache,
  cleanupOldRecords,
  isAlreadyPublished,
  markAsPublished
};
