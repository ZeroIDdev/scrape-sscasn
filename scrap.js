const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const minimist = require('minimist');

// Parse command-line arguments
const args = minimist(process.argv.slice(2), {
  default: {
    jenjangStart: 10, // Default start index for Jenjang Pendidikan
    jenjangEnd: 11,   // Default end index for Jenjang Pendidikan
    programStart: 3,  // Default start index for Program Studi
    programEnd: null, // Default end index for Program Studi (null means until the end)
    pengadaanIndex: 3, // Default index for Jenis Pengadaan
    batchSize: 50,    // Default batch size for saving data
  },
});

(async () => {
  // Array to store collected data
  let collectedData = [];

  // Global variable to store the current combination
  let currentData = {
    id: null,
    programStudi: null,
    programStudiIndex: null,
    jumlahData: null,
    jenjangPendidikan: null,
    jenjangPendidikanIndex: null,
  };

  // Function to retry an operation in case of failure
  const retryOperation = async (operation, maxRetries = 2, delay = 500) => {
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

  // Function to save data to a file
  const saveDataToFile = (filename, data) => {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`Data saved to ${filename}`);
  };

  // Generate a unique filename using the current timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `collectedData_${timestamp}.json`;

  try {
    // Launch the browser
    const browser = await chromium.launch({ headless: true });
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

    // Validate Jenjang Pendidikan range
    const jenjangStart = args.jenjangStart;
    const jenjangEnd = args.jenjangEnd !== null ? args.jenjangEnd : jenjangCount;

    if (jenjangStart < 0 || jenjangEnd > jenjangCount || jenjangStart >= jenjangEnd) {
      throw new Error('Invalid Jenjang Pendidikan range.');
    }

    // Loop through each Jenjang Pendidikan option
    for (let jenjangIndex = jenjangStart; jenjangIndex < jenjangEnd; jenjangIndex++) {
      // Select Jenjang Pendidikan option
      await retryOperation(async () => {
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

      // Validate Program Studi range
      const programStart = args.programStart;
      const programEnd = args.programEnd !== null ? args.programEnd : programStudiCount;

      if (programStart < 0 || programEnd > programStudiCount || programStart >= programEnd) {
        throw new Error('Invalid Program Studi range.');
      }

      // Loop through each Program Studi option
      for (let programStudiIndex = programStart; programStudiIndex < programEnd; programStudiIndex++) {
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

        // Select Jenis Pengadaan option
        await retryOperation(async () => {
          await page.click('input[placeholder="--- Pilih Jenis Pengadaan ---"]');
          // Re-fetch Jenis Pengadaan options to ensure they are attached to the DOM
          const jenisPengadaanOptions = await page.$$('ul.absolute.z-50.w-full.bg-white.border.mt-1.max-h-60.overflow-y-auto.shadow-md li');
          await page.waitForSelector('ul.absolute.z-50.w-full.bg-white.border.mt-1.max-h-60.overflow-y-auto.shadow-md');
          if (jenisPengadaanOptions[args.pengadaanIndex]) {
            await jenisPengadaanOptions[args.pengadaanIndex].click();
            await page.click('#notif');
          } else {
            throw new Error(`Jenis Pengadaan option at index ${args.pengadaanIndex} not found.`);
          }
        });

        await page.click('a[href="#daftarFormasi"]');
        // Wait for a short time to ensure the network request is captured
        await page.waitForSelector('.ant-pagination-total-text');
        const totalData = await page.evaluate(() => {
          return document.querySelector('.ant-pagination-total-text').textContent;
        });
        currentData.jumlahData = parseInt(totalData.match(/\d+/)[0], 10);

        // Add currentData to the collectedData array
        collectedData.push({ ...currentData });

        // Reset the ID for the next iteration
        currentData.id = null;

        // Log the collected data
        console.log('Collected Data:', collectedData[collectedData.length - 1]);

        // Save data to file every batchSize iterations
        if (collectedData.length % args.batchSize === 0) {
          saveDataToFile(filename, collectedData);
        }
      }
    }

    // Save any remaining data to file at the end
    if (collectedData.length > 0) {
      saveDataToFile(filename, collectedData);
    }

    // Close the browser
    await browser.close();
  } catch (error) {
    // Save collected data to file in case of an error
    if (collectedData.length > 0) {
      saveDataToFile(filename, collectedData);
    }
    console.error('Error during automation:', error);
  }
})();