// Всё, что захочется поменять руками, лежит здесь.
window.CARD = {
  title: 'С днём рождения,\nмамочка!',
  from: 'открытка от Глеба',

  voice: 'assets/audio/gleb.m4a',   // голос Глеба, 40 секунд
  drawing: 'assets/images/drawing.jpg',
  magic: 'assets/images/magic.jpg',

  hintLook: 'Посмотри на рисунок',
  hintAround: 'А теперь оглянись вокруг',
  hintEnd: 'Кнопка ↺ — послушать ещё раз',

  photos: [
    { src: 'assets/images/photo-1.jpg', caption: 'Мама и Глеб', angle: -88 },
    { src: 'assets/images/photo-2.jpg', caption: 'Мама и папа у моря', angle: 76 },
    { src: 'assets/images/photo-3.jpg', caption: 'Зимой втроём', angle: 168 }
  ],

  // Субтитры к голосу. Пусто — не показываются.
  // Пример: [{ at: 0, text: 'Мамочка, с днём рождения!' }, { at: 6, text: 'Я тебя люблю' }]
  captions: []
};
