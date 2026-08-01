const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  
  await page.goto('http://localhost:9999', { waitUntil: 'networkidle0' });
  
  // Click on users tab
  await page.evaluate(() => {
    const btns = document.querySelectorAll('.sidebar-nav .nav-btn[data-view="usersView"]');
    if (btns.length) btns[0].click();
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  const usersListHtml = await page.evaluate(() => {
    return document.getElementById('usersList')?.innerHTML || 'NO usersList';
  });
  
  console.log("FINAL usersList HTML:", usersListHtml);
  
  await browser.close();
})();
