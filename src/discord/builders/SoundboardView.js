import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { config } from '../../config/config.js';

/**
 * Components V2 soundboard: 5x5 grid of sound buttons plus a navigation row.
 * Budget: container 1 + header 1 + 5 rows x 6 + separator 1 + nav row 6 = 39 of 40 components.
 */
export const PAGE_SIZE = 25;
const BUTTONS_PER_ROW = 5;
const LABEL_MAX = 40;

const MODES = {
  play: { title: '🎵 Soundboard', accent: 0x5865f2, style: ButtonStyle.Primary, action: 'play' },
  delete: { title: '🗑️ Delete sounds', accent: 0xff4444, style: ButtonStyle.Danger, action: 'del' },
};

const SORT_LABELS = { popular: '⭐ Popular', recent: '🕒 Recent' };

/**
 * Remove MyInstants suffixes from a sound title
 */
export function cleanTitle(title) {
  return title
    .replace(/\s*-\s*Botón de sonido\s*/gi, '')
    .replace(/\s*-\s*Instant Sound Button\s*/gi, '')
    .replace(/\s*\|\s*Myinstants\s*/gi, '')
    .trim();
}

export function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Build the soundboard message payload
 * @param {Object} view
 * @param {'play'|'delete'} view.mode
 * @param {'popular'|'recent'} view.sort
 * @param {{sounds: Object[], total: number, page: number, pages: number}} view.result - From SoundRepository.page
 * @param {string} [view.notice] - Extra line shown under the header
 * @returns {{components: ContainerBuilder[], flags: number}}
 */
export function buildSoundboard({ mode, sort, result, notice }) {
  const { sounds, total, page, pages } = result;
  const ui = MODES[mode];
  const limit = config.bot.maxSoundsPerGuild;
  const count = limit > 0 ? `${total}/${limit}` : `${total}`;

  const lines = [`### ${ui.title}`];
  lines.push(total === 0
    ? '📭 No sounds saved yet! Use `/play` to add one.'
    : `-# ${count} sounds · ${SORT_LABELS[sort]} · page ${page + 1}/${pages}`);
  if (notice) lines.push(notice);

  const container = new ContainerBuilder()
    .setAccentColor(ui.accent)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  if (total === 0) {
    return { components: [container], flags: MessageFlags.IsComponentsV2 };
  }

  for (let i = 0; i < sounds.length; i += BUTTONS_PER_ROW) {
    const row = new ActionRowBuilder().addComponents(
      sounds.slice(i, i + BUTTONS_PER_ROW).map((sound) =>
        new ButtonBuilder()
          .setCustomId(`sb:${ui.action}:${sound.id}:${sort}:${page}`)
          .setLabel(truncate(cleanTitle(sound.title), LABEL_MAX))
          .setStyle(ui.style)
      )
    );
    container.addActionRowComponents(row);
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(buildNavRow(mode, sort, page, pages));

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

/**
 * ⏮ ◀ ▶ ⏭ + sort toggle. Each button carries its target state: sb:nav:<mode>:<sort>:<page>:<tag>
 * (the tag keeps custom IDs unique when two buttons point at the same page)
 */
function buildNavRow(mode, sort, page, pages) {
  const nav = (tag, targetSort, targetPage) => `sb:nav:${mode}:${targetSort}:${targetPage}:${tag}`;
  const last = pages - 1;
  const otherSort = sort === 'popular' ? 'recent' : 'popular';

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(nav('f', sort, 0)).setEmoji('⏮️')
      .setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(nav('p', sort, page - 1)).setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(nav('n', sort, page + 1)).setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary).setDisabled(page === last),
    new ButtonBuilder().setCustomId(nav('l', sort, last)).setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary).setDisabled(page === last),
    new ButtonBuilder().setCustomId(nav('s', otherSort, 0)).setLabel(`Sort: ${SORT_LABELS[otherSort]}`)
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * Confirmation step for deleting a sound; returns to the same delete page afterwards
 */
export function buildDeleteConfirm(sound, sort, page) {
  const container = new ContainerBuilder()
    .setAccentColor(MODES.delete.accent)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `### ⚠️ Delete this sound?\n**${cleanTitle(sound.title)}**\n-# ▶ ${sound.play_count} plays · this cannot be undone`
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sb:delc:${sound.id}:${sort}:${page}`)
        .setLabel('Yes, delete').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`sb:delx:${sound.id}:${sort}:${page}`)
        .setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    ));

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}
