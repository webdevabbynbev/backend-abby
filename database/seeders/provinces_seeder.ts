import Province from '#models/province'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder {
  async run() {
    const provinceToCreate = [
  { id: 1, name: 'Bali' },
  { id: 2, name: 'Bangka Belitung' },
  { id: 3, name: 'Banten' },
  { id: 4, name: 'Bengkulu' },
  { id: 5, name: 'DI Yogyakarta' },
  { id: 6, name: 'DKI Jakarta' },
  { id: 7, name: 'Gorontalo' },
  { id: 8, name: 'Jambi' },
  { id: 9, name: 'Jawa Barat' },
  { id: 10, name: 'Jawa Tengah' },
  { id: 11, name: 'Jawa Timur' },
  { id: 12, name: 'Kalimantan Barat' },
  { id: 13, name: 'Kalimantan Selatan' },
  { id: 14, name: 'Kalimantan Tengah' },
  { id: 15, name: 'Kalimantan Timur' },
  { id: 16, name: 'Kalimantan Utara' },
  { id: 17, name: 'Kepulauan Riau' },
  { id: 18, name: 'Lampung' },
  { id: 19, name: 'Maluku' },
  { id: 20, name: 'Maluku Utara' },
  { id: 21, name: 'Nanggroe Aceh Darussalam (NAD)' },
  { id: 22, name: 'Nusa Tenggara Barat (NTB)' },
  { id: 23, name: 'Nusa Tenggara Timur (NTT)' },
  { id: 24, name: 'Papua' },
  { id: 25, name: 'Papua Barat' },
  { id: 26, name: 'Papua Barat Daya' },    
  { id: 27, name: 'Papua Pegunungan' },    
  { id: 28, name: 'Papua Selatan' },       
  { id: 29, name: 'Papua Tengah' },        
  { id: 30, name: 'Riau' },
  { id: 31, name: 'Sulawesi Barat' },
  { id: 32, name: 'Sulawesi Selatan' },
  { id: 33, name: 'Sulawesi Tengah' },
  { id: 34, name: 'Sulawesi Tenggara' },
  { id: 35, name: 'Sulawesi Utara' },
  { id: 36, name: 'Sumatera Barat' },
  { id: 37, name: 'Sumatera Selatan' },
  { id: 38, name: 'Sumatera Utara' },
];
    await Province.updateOrCreateMany('name', provinceToCreate)
  }
}
