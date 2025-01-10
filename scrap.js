const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  // Array to store collected data
  let collectedData = [];


  // Global variable to store the current combination
  let currentData = {
    id: null,
    programStudi: null,
    programStudiIndex: null,
    jumlahData : null,
    jenjangPendidikan: null,
    jenjangPendidikanIndex: null,
  };

  // Function to retry an operation in case of failure
  const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        console.error(`Attempt ${i + 1} failed:`, error.message);
        if (i < maxRetries - 1) {
          console.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw new Error(`Operation failed after ${maxRetries} attempts.`);
  };

  try {
    // Launch the browser
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Listen for network requests to capture the ID
    page.on('request', (request) => {
      if (request.url().includes('https://api-sscasn.bkn.go.id/2024/portal')) {
        const id = new URL(request.url()).searchParams.get('kode_ref_pend');
        if (id) {
          // Update the global currentData object
          currentData.id = id;
        }
      }
    });

    // Navigate to the URL
    await page.goto('https://sscasn.bkn.go.id/#daftarFormasi');

    // Wait for the form to load
    await page.waitForSelector('form');

    // Scroll the form into view
    const form = await page.$('form');
    await form.scrollIntoViewIfNeeded();

    // Get all Jenjang Pendidikan options
    await page.waitForSelector('input[placeholder="--- Pilih Jenjang Pendidikan ---"]');
    await page.click('input[placeholder="--- Pilih Jenjang Pendidikan ---"]');
    let jenjangOptions = await page.$$('ul.absolute.z-50.w-full.bg-white.border.mt-1.max-h-60.overflow-y-auto.shadow-md li');
    const jenjangCount = jenjangOptions.length;

    // Loop through each Jenjang Pendidikan option (start from index 1)
    for (let jenjangIndex = 10; jenjangIndex < 11; jenjangIndex++) {
      // Select Jenjang Pendidikan option
      await retryOperation(async () => {
        await page.waitForSelector('input[placeholder="--- Pilih Jenjang Pendidikan ---"]');
        await page.click('input[placeholder="--- Pilih Jenjang Pendidikan ---"]');
        // Re-fetch Jenjang Pendidikan options to ensure they are attached to the DOM
        jenjangOptions = await page.$$('ul.absolute.z-50.w-full.bg-white.border.mt-1.max-h-60.overflow-y-auto.shadow-md li');
        await jenjangOptions[jenjangIndex].click();
        await page.click('#notif');
      });

      currentData.jenjangPendidikan = await jenjangOptions[jenjangIndex].textContent();
      currentData.jenjangPendidikanIndex = jenjangIndex;
      // Get all Program Studi options
      await page.click('input[placeholder="--- Pilih Program Studi ---"]');
      await page.waitForSelector('ul.absolute.z-50.w-full.bg-white.border.mt-1.max-h-60.overflow-y-auto.shadow-md li:nth-child(2)');
      let programStudiOptions = await page.$$('ul.absolute.z-50.w-full.bg-white.border.mt-1.max-h-60.overflow-y-auto.shadow-md li');
      const programStudiCount = programStudiOptions.length;

      // Loop through each Program Studi option (start from index 1)
      for (let programStudiIndex = 3; programStudiIndex < programStudiCount; programStudiIndex++) {
        // Select Program Studi option
        await retryOperation(async () => {
          await page.click('input[placeholder="--- Pilih Program Studi ---"]');
          // Re-fetch Program Studi options to ensure they are attached to the DOM
          programStudiOptions = await page.$$('ul.absolute.z-50.w-full.bg-white.border.mt-1.max-h-60.overflow-y-auto.shadow-md li');
          await page.waitForSelector('ul.absolute.z-50.w-full.bg-white.border.mt-1.max-h-60.overflow-y-auto.shadow-md');
          await programStudiOptions[programStudiIndex].click();
          await page.click('#notif');
        });

        currentData.programStudi = await programStudiOptions[programStudiIndex].textContent();
        currentData.programStudiIndex = programStudiIndex;

        // Select Jenis Pengadaan option (always index 3)
        await retryOperation(async () => {
          await page.click('input[placeholder="--- Pilih Jenis Pengadaan ---"]');
          // Re-fetch Jenis Pengadaan options to ensure they are attached to the DOM
          const jenisPengadaanOptions = await page.$$('ul.absolute.z-50.w-full.bg-white.border.mt-1.max-h-60.overflow-y-auto.shadow-md li');
          await page.waitForSelector('ul.absolute.z-50.w-full.bg-white.border.mt-1.max-h-60.overflow-y-auto.shadow-md');
          if (jenisPengadaanOptions[3]) {
            await jenisPengadaanOptions[3].click();
            await page.click('#notif');
          } else {
            throw new Error('Jenis Pengadaan option at index 3 not found.');
          }
        });


        await page.click('a[href="#daftarFormasi"]');
        // Wait for a short time to ensure the network request is captured
        await page.waitForSelector('.ant-pagination-total-text');
        const totalData = await page.textContent('.ant-pagination-total-text');
        currentData.jumlahData = parseInt(totalData.match(/\d+/)[0], 10);
        // Add currentData to the collectedData array
        collectedData.push({ ...currentData });

        // Reset the ID for the next iteration
        currentData.id = null;

        // Log the collected data
        console.log('Collected Data:', collectedData[collectedData.length - 1]);
        // Save collected data to a JSON file
        fs.writeFileSync('collectedData.json', JSON.stringify(collectedData, null, 2));
        console.log('Data saved to collectedData.json');
      }
    }


    // Close the browser
    await browser.close();
  } catch (error) {
    console.error('Error during automation:', error);
  }
})();