alter table profiles
  add column card_theme text default 'classic_gold' not null
  check (card_theme in (
    'classic_gold',
    'rose_gold',
    'champagne',
    'platinum',
    'black_on_black',
    'dual_tone'
  ));

update profiles set card_theme = 'classic_gold' where card_theme is null;
