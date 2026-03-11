const cheerio = require('cheerio');
const https = require('https');
const http = require('http');

// AI相关关键词
const AI_KEYWORDS = [
  'ai', 'artificial-intelligence', 'machine-learning', 'deep-learning',
  'neural-network', 'nlp', 'computer-vision', 'llm', 'gpt', 'transformer',
  'pytorch', 'tensorflow', 'langchain', 'openai', 'claude', 'embedding', 'rag',
  'fine-tuning', 'model', 'chatbot', 'agent', 'hugging', 'diffusion',
  'stable-diffusion', 'midjourney', 'generative', 'supervised', 'unsupervised',
  'reinforcement', 'classification', 'detection', 'segmentation', 'ocr',
  'speech', 'voice', 'recommendation', 'optimization', 'training', 'inference'
];

// AI常用语言
const AI_LANGUAGES = ['Python', 'Jupyter Notebook', 'Julia', 'R', 'MATLAB'];

/**
 * 通用HTTP/HTTPS请求函数
 */
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const timeout = options.timeout || 10000;

    const req = protocol.get(url, {
      headers: {
        'User-Agent': options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...options.headers
      },
      timeout
    }, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * 爬取GitHub Trending页面
 * @param {string} since - 'daily', 'weekly', 'monthly'
 * @param {string} language - 编程语言过滤（可选）
 */
async function fetchGitHubTrending(since = 'weekly', language = '') {
  const url = `https://github.com/trending${language ? '/' + language : ''}?since=${since}`;

  try {
    console.log(`🔍 获取GitHub Trending (${since})...`);
    const html = await fetch(url, {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      timeout: 15000
    });

    return parseTrendingHTML(html);
  } catch (error) {
    console.error('⚠️ 获取GitHub Trending失败:', error.message);
    return [];
  }
}

/**
 * 解析GitHub Trending HTML
 */
function parseTrendingHTML(html) {
  const $ = cheerio.load(html);
  const projects = [];

  $('article.Box-row').each((index, element) => {
    try {
      const $article = $(element);

      // 项目名称和链接
      const $link = $article.find('h2 a');
      const fullName = $link.attr('href').replace(/^\//, '');
      const url = 'https://github.com/' + fullName;

      // 描述
      const description = $article.find('p.col-9').text().trim();

      // 语言
      const language = $article.find('[itemprop="programmingLanguage"]').text().trim();

      // Stars总数
      const totalStars = $article.find('a[href*="/stargazers"]').text().trim().replace(/,/g, '');

      // 本周/本日新增stars
      const starsThisPeriod = $article.find('span.d-inline-block.float-sm-right').text().trim();
      const starsMatch = starsThisPeriod.match(/(\d+,?\d*)\s*stars/);

      projects.push({
        name: fullName,
        url,
        description,
        language,
        totalStars: parseInt(totalStars) || 0,
        starsThisPeriod: starsMatch ? parseInt(starsMatch[1].replace(/,/g, '')) : 0
      });
    } catch (e) {
      // 跳过解析失败的项目
    }
  });

  return projects;
}

/**
 * 判断项目是否为AI相关
 */
function isAIProject(project) {
  const text = `${project.name} ${project.description}`.toLowerCase();

  // 检查是否包含AI关键词
  const hasAIKeyword = AI_KEYWORDS.some(keyword => text.includes(keyword.toLowerCase()));

  if (hasAIKeyword) {
    return true;
  }

  // 检查是否为AI常用语言且获得较高关注
  if (AI_LANGUAGES.includes(project.language) && project.starsThisPeriod >= 100) {
    return true;
  }

  return false;
}

/**
 * 筛选AI相关项目
 */
function filterAIProjects(projects) {
  return projects.filter(isAIProject);
}

/**
 * 生成周报的GitHub Trending部分（Markdown格式）
 */
async function generateWeeklyTrendingReport() {
  try {
    const projects = await fetchGitHubTrending('weekly');
    const aiProjects = filterAIProjects(projects);

    if (aiProjects.length === 0) {
      console.log('⚠️ 未找到AI相关的GitHub Trending项目');
      return '';
    }

    // 取Top 10
    const topProjects = aiProjects.slice(0, 10);

    let md = '\n### 五、GitHub Trending AI项目\n\n';
    md += '本周GitHub上最受关注的AI项目：\n\n';

    topProjects.forEach((project, index) => {
      const stars = project.totalStars.toLocaleString();
      const starsThisWeek = project.starsThisPeriod > 0
        ? ` (+${project.starsThisPeriod.toLocaleString()} this week)`
        : '';

      md += `${index + 1}. **[${project.name}](${project.url})**`;
      if (project.language) {
        md += ` (${project.language})`;
      }
      md += '\n';
      md += `   - ${project.description || '暂无描述'}\n`;
      md += `   - ⭐ ${stars}${starsThisWeek}\n\n`;
    });

    console.log(`✅ 获取到 ${topProjects.length} 个AI相关的GitHub Trending项目`);
    return md;
  } catch (error) {
    console.error('⚠️ 生成GitHub Trending报告失败:', error.message);
    return '';
  }
}

/**
 * 获取每日GitHub Trending（用于每日快讯）
 */
async function getDailyTrending() {
  try {
    const projects = await fetchGitHubTrending('daily');
    const aiProjects = filterAIProjects(projects);
    return aiProjects.slice(0, 5); // 每日只取Top 5
  } catch (error) {
    console.error('⚠️ 获取每日GitHub Trending失败:', error.message);
    return [];
  }
}

module.exports = {
  fetchGitHubTrending,
  parseTrendingHTML,
  filterAIProjects,
  generateWeeklyTrendingReport,
  getDailyTrending,
  isAIProject
};
