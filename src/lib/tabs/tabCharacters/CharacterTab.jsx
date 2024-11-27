import { DownOutlined, ExclamationCircleOutlined, UserOutlined } from '@ant-design/icons'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-balham.css'

import { Button, Dropdown, Flex, Input, Modal, theme, Typography } from 'antd'
import { useSubscribe } from 'hooks/useSubscribe'
import i18next from 'i18next'
import { CharacterPreview } from 'lib/characterPreview/CharacterPreview'
import { ShowcaseSource } from 'lib/characterPreview/CharacterPreviewComponents'
import { arrowKeyGridNavigation } from 'lib/interactions/arrowKeyGridNavigation'
import { Message } from 'lib/interactions/message'
import BuildsModal from 'lib/overlays/modals/BuildsModal'
import CharacterModal from 'lib/overlays/modals/CharacterModal'
import NameBuild from 'lib/overlays/modals/SaveBuildModal'
import SwitchRelicsModal from 'lib/overlays/modals/SwitchRelicsModal'
import { RelicScorer } from 'lib/relics/relicScorerPotential'
import { Assets } from 'lib/rendering/assets'
import { getGridTheme } from 'lib/rendering/theme'
import DB, { AppPages } from 'lib/state/db'
import { SaveState } from 'lib/state/saveState'
import {
  generateElementTags,
  generatePathTags,
  SegmentedFilterRow,
} from 'lib/tabs/tabOptimizer/optimizerForm/components/CardSelectModalComponents.tsx'
import { OptimizerTabController } from 'lib/tabs/tabOptimizer/optimizerTabController'
import { Utils } from 'lib/utils/utils'
import PropTypes from 'prop-types'
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

const { useToken } = theme
const { Text } = Typography

function cellImageRenderer(params) {
  const data = params.data
  const characterIconSrc = Assets.getCharacterAvatarById(data.id)

  return (
    <img
      src={characterIconSrc}
      style={{ flex: '0 0 auto', maxWidth: '100%', width: 48 }}
    />
  )
}

function cellRankRenderer(params) {
  const data = params.data
  const character = DB.getCharacters().find((x) => x.id == data.id)

  return (
    <Text style={{ height: '100%' }}>
      {character.rank + 1}
    </Text>
  )
}

function cellNameRenderer(params) {
  const t = i18next.getFixedT(null, 'gameData', 'Characters')
  const data = params.data
  const characterNameString = t(`${data.id}.LongName`)

  // Separate the path parens for multipath characters or handle dots so they render on separate lines if overflow
  const nameSections = characterNameString.includes(' (')
    ? characterNameString.split(' (')
      .map((section) => section.trim())
      .map((section, index) => index === 1 ? ` (${section} ` : section)
    : characterNameString.split(/ - |•/) // some languages use a dash instead of a dot
      .map((section) => section.trim())

  const nameSectionRender = nameSections
    .map((section, index) => (
      <span key={index} style={{ display: 'inline-block' }}>{section}</span>
    ))

  const equippedNumber = data.equipped ? Object.values(data.equipped).filter((x) => x != undefined).length : 0
  let color = '#81d47e'
  if (equippedNumber < 6) color = 'rgb(229, 135, 66)'
  if (equippedNumber < 1) color = '#d72f2f'

  return (
    <Flex align='center' justify='flex-start' style={{ height: '100%', width: '100%' }}>
      <Text
        style={{
          margin: 'auto',
          padding: '0px 5px',
          textAlign: 'center',
          overflow: 'hidden',
          whiteSpace: 'break-spaces',
          textWrap: 'wrap',
          fontSize: 14,
          width: '100%',
          lineHeight: '18px',
        }}
      >
        {nameSectionRender}
      </Text>
      <Flex style={{ display: 'block', width: 3, height: '100%', backgroundColor: color, zIndex: 2 }}>

      </Flex>
    </Flex>
  )
}

const defaultFilters = {
  path: [],
  element: [],
}

export default function CharacterTab() {
  const { token } = useToken()

  const [confirmationModal, contextHolder] = Modal.useModal()
  const [screenshotLoading, setScreenshotLoading] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)

  const [isCharacterModalOpen, setCharacterModalOpen] = useState(false)
  const [isSwitchRelicsModalOpen, setSwitchRelicsModalOpen] = useState(false)
  const [isSaveBuildModalOpen, setIsSaveBuildModalOpen] = useState(false)
  const [isBuildsModalOpen, setIsBuildsModalOpen] = useState(false)
  const [characterModalAdd, setCharacterModalAdd] = useState(false)
  const [characterModalInitialCharacter, setCharacterModalInitialCharacter] = useState()
  const nameFilter = useRef('')

  const [characterFilters, setCharacterFilters] = useState(defaultFilters)

  const { t } = useTranslation(['charactersTab', 'common', 'gameData'])

  console.log('======================================================================= RENDER CharacterTab')

  useSubscribe('refreshRelicsScore', () => {
    // TODO: understand why setTimeout is needed and refactor
    setTimeout(() => {
      window.forceCharacterTabUpdate()
    }, 100)
  })

  const items = [
    {
      key: 'character group',
      type: 'group',
      label: t('CharacterMenu.Character.Label')/* Character */,
      children: [
        {
          label: t('CharacterMenu.Character.Options.Add')/* Add new character */,
          key: 'add',
        },
        {
          label: t('CharacterMenu.Character.Options.Edit')/* Edit character / light cone */,
          key: 'edit',
        },
        {
          label: t('CharacterMenu.Character.Options.Switch')/* Switch relics with */,
          key: 'switchRelics',
        },
        {
          label: t('CharacterMenu.Character.Options.Unequip')/* Unequip character */,
          key: 'unequip',
        },
        {
          label: t('CharacterMenu.Character.Options.Delete')/* Delete character */,
          key: 'delete',
        },
      ],
    },
    {
      key: 'builds group',
      type: 'group',
      label: t('CharacterMenu.Build.Label')/* Builds */,
      children: [
        {
          label: t('CharacterMenu.Build.Options.Save')/* Save current build */,
          key: 'saveBuild',
        },
        {
          label: t('CharacterMenu.Build.Options.View')/* View saved builds */,
          key: 'viewBuilds',
        },
      ],
    },
    {
      key: 'scoring group',
      type: 'group',
      label: t('CharacterMenu.Scoring.Label')/* Scoring */,
      children: [
        {
          label: t('CharacterMenu.Scoring.Options.ScoringModal')/* Scoring algorithm */,
          key: 'scoring',
        },
      ],
    },
    {
      key: 'priority group',
      type: 'group',
      label: t('CharacterMenu.Priority.Label')/* Priority */,
      children: [
        {
          label: t('CharacterMenu.Priority.Options.SortByScore')/* Sort all characters by score */,
          key: 'sortByScore',
        },
        {
          label: t('CharacterMenu.Priority.Options.MoveToTop')/* Move character to top */,
          key: 'moveToTop',
        },
      ],
    },
  ]

  const characterGrid = useRef() // Optional - for accessing Grid's API
  window.characterGrid = characterGrid

  const [characterRows, setCharacterRows] = React.useState(DB.getCharacters())
  window.setCharacterRows = setCharacterRows

  const characterTabFocusCharacter = window.store((s) => s.characterTabFocusCharacter)
  const setCharacterTabFocusCharacter = window.store((s) => s.setCharacterTabFocusCharacter)
  const setScoringAlgorithmFocusCharacter = window.store((s) => s.setScoringAlgorithmFocusCharacter)
  const charactersById = window.store((s) => s.charactersById)
  const selectedCharacter = charactersById[characterTabFocusCharacter]

  const [, forceUpdate] = React.useReducer((o) => !o)
  window.forceCharacterTabUpdate = () => {
    console.log('__________ CharacterTab forceCharacterTabUpdate')
    forceUpdate()

    // no charGrid in scorer tab
    if (characterGrid?.current?.api?.redrawRows) {
      characterGrid.current.api.redrawRows()
    } else {
      console.log('@forceCharacterTabUpdate: No characterGrid.current.api')
    }
  }

  const columnDefs = useMemo(() => [
    { field: '', headerName: t('GridHeaders.Icon')/* Icon */, cellRenderer: cellImageRenderer, width: 52 },
    {
      field: '',
      headerName: t('GridHeaders.Priority')/* Priority */,
      cellRenderer: cellRankRenderer,
      width: 60,
      rowDrag: true,
    },
    { field: '', headerName: t('GridHeaders.Character')/* Character */, flex: 1, cellRenderer: cellNameRenderer },
  ], [t])

  const gridOptions = useMemo(() => ({
    rowHeight: 46,
    rowDragManaged: true,
    animateRows: true,
    suppressDragLeaveHidesColumns: true,
    suppressScrollOnNewData: true,
  }), [])

  const defaultColDef = useMemo(() => ({
    sortable: false,
    cellStyle: { display: 'flex' },
  }), [])

  const externalFilterChanged = useCallback(() => {
    characterGrid.current.api.onFilterChanged()
  }, [])

  const doesExternalFilterPass = useCallback(
    (node) => {
      const filteredCharacter = DB.getMetadata().characters[node.data.id]
      if (characterFilters.element.length && !characterFilters.element.includes(filteredCharacter.element)) {
        return false
      }
      if (characterFilters.path.length && !characterFilters.path.includes(filteredCharacter.path)) {
        return false
      }
      return t(`gameData:Characters.${node.data.id}.LongName`).toLowerCase().includes(nameFilter.current)
    }, [characterFilters],
  )

  const isExternalFilterPresent = useCallback(() => {
    return characterFilters.element.length + characterFilters.path.length + nameFilter.current.length > 0
  }, [characterFilters])

  const cellClickedListener = useCallback((event) => {
    const data = event.data

    // Only blur if different character
    setCharacterTabFocusCharacter(data.id)
    console.log(`@CharacterTab::setCharacterTabFocusCharacter - [${data.id}]`, event.data)
  }, [setCharacterTabFocusCharacter])

  // TODO: implement routing to handle this
  const setActiveKey = window.store((s) => s.setActiveKey)

  const cellDoubleClickedListener = useCallback((e) => {
    setActiveKey(AppPages.OPTIMIZER)
    OptimizerTabController.setCharacter(e.data.id)
    console.log(`@CharacterTab.cellDoubleClickedListener::setOptimizerTabFocusCharacter - focus [${e.data.id}]`, e.data)
  }, [])

  const navigateToNextCell = useCallback((params) => {
    return arrowKeyGridNavigation(params, characterGrid, (selectedNode) => cellClickedListener(selectedNode))
  }, [])

  function drag(event, index) {
    const dragged = event.node.data
    DB.insertCharacter(dragged.id, index)
    SaveState.delayedSave()
    characterGrid.current.api.redrawRows()
  }

  const onRowDragEnd = useCallback((event) => {
    drag(event, event.overIndex)
  }, [])

  // The grid can do weird things when you drag rows beyond its bounds, cap the behavior
  const onRowDragLeave = useCallback((event) => {
    if (event.overIndex == 0) {
      drag(event, 0)
    } else if (event.overIndex == -1 && event.vDirection == 'down') {
      drag(event, DB.getCharacters().length)
    } else if (event.overIndex == -1 && event.vDirection == 'up') {
      drag(event, 0)
    } else {
      drag(event, event.overIndex)
    }
  }, [])

  function removeClicked() {
    const selectedNodes = characterGrid.current.api.getSelectedNodes()
    if (!selectedNodes || selectedNodes.length == 0) {
      return
    }

    const row = selectedNodes[0].data
    const id = row.id

    DB.removeCharacter(id)
    setCharacterRows(DB.getCharacters())
    setCharacterTabFocusCharacter(undefined)
    if (window.relicsGrid?.current?.api) {
      window.relicsGrid.current.api.redrawRows()
    }

    SaveState.delayedSave()

    Message.success(t('Messages.RemoveSuccess')/* Successfully removed character */)
  }

  function unequipClicked() {
    console.log('unequipClicked', DB.getCharacterById(characterTabFocusCharacter))

    const selectedNodes = characterGrid.current.api.getSelectedNodes()
    if (!selectedNodes || selectedNodes.length == 0) {
      return
    }
    const row = selectedNodes[0].data
    const id = row.id

    DB.unequipCharacter(id)

    characterGrid.current.api.redrawRows()
    window.forceCharacterTabUpdate()
    Message.success(t('Messages.UnequipSuccess')/* Successfully unequipped character */)
    window.relicsGrid.current.api.redrawRows()

    SaveState.delayedSave()
  }

  // Reuse the same modal for both edit/add and scroll to the selected character
  function onCharacterModalOk(form) {
    if (!form.characterId) {
      return Message.error(t('Messages.NoSelectedCharacter')/* No selected character */)
    }

    const character = DB.addFromForm(form)
    window.characterGrid.current.api.ensureIndexVisible(character.rank)
  }

  function onSwitchRelicsModalOk(switchToCharacter) {
    if (!switchToCharacter) {
      return Message.error(t('Messages.NoSelectedCharacter')/* No selected character */)
    }

    DB.switchRelics(selectedCharacter.id, switchToCharacter.value)
    SaveState.delayedSave()

    characterGrid.current.api.redrawRows()
    window.forceCharacterTabUpdate()
    /* Successfully switched relics with ${CharacterName} */
    Message.success(t('Messages.SwitchSuccess', { charId: switchToCharacter.value }))
    window.relicsGrid.current.api.redrawRows()
  }

  function scoringAlgorithmClicked() {
    if (characterTabFocusCharacter) setScoringAlgorithmFocusCharacter(characterTabFocusCharacter)
    window.store.getState().setScoringModalOpen(true)
  }

  function moveToTopClicked() {
    DB.insertCharacter(characterTabFocusCharacter, 0)
    DB.refreshCharacters()
    SaveState.delayedSave()
  }

  async function sortByScoreClicked() {
    if (!await confirm(
      <>
        {/* Are you sure you want to sort all characters? <0/>You will lose any custom rankings you have set. */}
        <Trans t={t} i18nKey='Messages.SortByScoreWarning'>
          <br/>
        </Trans>
      </>,
    )) {
      return
    }

    const characterList = DB.getCharacters()

    const scoredCharacters = characterList
      .map((x) => ({ score: RelicScorer.scoreCharacter(x), character: x }))
      .sort((a, b) => b.score.totalScore - a.score.totalScore)
      .map((x) => x.character)

    DB.setCharacters(scoredCharacters)
    DB.refreshCharacters()
    SaveState.delayedSave()
  }

  function clipboardClicked() {
    setScreenshotLoading(true)
    // Use a small timeout here so the spinner doesn't lag while the image is being generated
    setTimeout(() => {
      Utils.screenshotElementById('characterTabPreview', 'clipboard').finally(() => {
        setScreenshotLoading(false)
      })
    }, 100)
  }

  function downloadClicked() {
    setDownloadLoading(true)
    // Use a small timeout here so the spinner doesn't lag while the image is being generated
    setTimeout(() => {
      const name = selectedCharacter ? t(`gameData:Characters.${selectedCharacter.id}.Name`) : null
      Utils.screenshotElementById('characterTabPreview', 'download', name).finally(() => {
        setDownloadLoading(false)
      })
    }, 100)
  }

  function confirmSaveBuild(name) {
    const score = RelicScorer.scoreCharacter(selectedCharacter)
    const res = DB.saveCharacterBuild(name, selectedCharacter.id, {
      score: score.totalScore.toFixed(0),
      rating: score.totalRating,
    })
    if (res) {
      Message.error(res.error)
      return
    }
    Message.success(t('charactersTab:Messages.SaveSuccess'/* Successfully saved build: {{name}} */, { name: name }))
    SaveState.delayedSave()
    setIsSaveBuildModalOpen(false)
  }

  const handleActionsMenuClick = async (e) => {
    if (!selectedCharacter && e.key != 'add' && e.key != 'scoring' && e.key != 'sortByScore') {
      Message.error(t('Messages.NoSelectedCharacter')/* No selected character */)
      return
    }

    switch (e.key) {
      case 'add':
        setCharacterModalAdd(true)
        setCharacterModalInitialCharacter(null)
        setCharacterModalOpen(true)
        break
      case 'edit':
        setCharacterModalAdd(false)
        setCharacterModalInitialCharacter(selectedCharacter)
        setCharacterModalOpen(true)
        break
      case 'switchRelics':
        setSwitchRelicsModalOpen(true)
        break
      case 'unequip':
        /* Are you sure you want to unequip $t(gameData:Characters.{{charId}}.Name)? */
        if (!await confirm(t('Messages.UnequipWarning', { charId: selectedCharacter.id }))) return
        unequipClicked()
        break
      case 'delete':
        /* Are you sure you want to delete $t(gameData:Characters.{{charId}}.Name)? */
        if (!await confirm(t('Messages.DeleteWarning', { charId: selectedCharacter.id }))) return
        removeClicked()
        break
      case 'saveBuild':
        setIsSaveBuildModalOpen(true)
        break
      case 'viewBuilds':
        setIsBuildsModalOpen(true)
        break
      case 'scoring':
        scoringAlgorithmClicked()
        break
      case 'moveToTop':
        moveToTopClicked()
        break
      case 'sortByScore':
        sortByScoreClicked()
        break
      default:
        console.error(`Unknown key ${e.key} in handleActionsMenuClick`)
    }
  }

  const actionsMenuProps = {
    items,
    onClick: handleActionsMenuClick,
  }

  async function confirm(content) {
    return confirmationModal.confirm({
      title: t('common:Confirm'), // 'Confirm',
      icon: <ExclamationCircleOutlined/>,
      content: content,
      okText: t('common:Confirm'), // 'Confirm',
      cancelText: t('common:Cancel'), // 'Cancel',
      centered: true,
    })
  }

  const defaultGap = 8
  const parentH = 280 * 3 + defaultGap * 2

  return (
    <Flex
      style={{
        height: '100%',
        marginBottom: 200,
        width: 1455,
      }}
      gap={defaultGap}
    >
      <Flex vertical gap={defaultGap}>
        <Dropdown
          placement='topLeft'
          menu={actionsMenuProps}
          trigger={['hover']}
        >
          <Button
            style={{ width: '100%', height: 40, boxShadow: 'unset', borderRadius: 8 }}
            icon={<UserOutlined/>}
            type='default'
          >
            {t('CharacterMenu.ButtonText')/* Character menu */}
            <DownOutlined/>
          </Button>
        </Dropdown>
        <Flex vertical gap={8} style={{ minWidth: 240 }}>
          <div
            id='characterGrid' className='ag-theme-balham-dark' style={{
            ...{ display: 'block', width: '100%', height: parentH },
            ...getGridTheme(token),
          }}
          >
            <AgGridReact
              ref={characterGrid}

              rowData={characterRows}
              gridOptions={gridOptions}
              getRowNodeId={(data) => data.id}

              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              deltaRowDataMode={true}

              headerHeight={24}

              onCellClicked={cellClickedListener}
              onCellDoubleClicked={cellDoubleClickedListener}
              onRowDragEnd={onRowDragEnd}
              onRowDragLeave={onRowDragLeave}
              navigateToNextCell={navigateToNextCell}
              isExternalFilterPresent={isExternalFilterPresent}
              doesExternalFilterPass={doesExternalFilterPass}
              rowSelection='single'
            />
          </div>
        </Flex>
      </Flex>
      <Flex vertical gap={defaultGap}>
        <Flex
          gap={8}
          style={{ width: '100%', marginBottom: 0, alignItems: 'center' }}
          justify='space-between'
        >
          <Input
            allowClear
            size='large'
            // Revisit width of search + filters with Remembrance path
            style={{ height: 40, fontSize: 14, width: 200, borderRadius: 8 }}
            placeholder={t('SearchPlaceholder')/* Search */}
            onChange={(e) => {
              nameFilter.current = e.target.value.toLowerCase()
              externalFilterChanged()
            }}
          />
          <Flex style={{ flex: 1 }}>
            <SegmentedFilterRow
              name='path'
              tags={generatePathTags()}
              flexBasis='14.2%'
              currentFilters={characterFilters}
              setCurrentFilters={setCharacterFilters}
            />
          </Flex>
          <Flex
            // Selected to align with relics panel
            style={{ width: 408 }}
          >
            <SegmentedFilterRow
              name='element'
              tags={generateElementTags()}
              flexBasis='14.2%'
              currentFilters={characterFilters}
              setCurrentFilters={setCharacterFilters}
            />
          </Flex>
        </Flex>
        <Flex style={{ height: '100%' }}>
          <Flex vertical>
            <CharacterPreview
              id='characterTabPreview'
              source={ShowcaseSource.CHARACTER_TAB}
              character={selectedCharacter}
              setOriginalCharacterModalOpen={setCharacterModalOpen}
              setOriginalCharacterModalInitialCharacter={setCharacterModalInitialCharacter}
              setCharacterModalAdd={setCharacterModalAdd}
            />
          </Flex>
        </Flex>
      </Flex>
      <CharacterModal
        onOk={onCharacterModalOk}
        open={isCharacterModalOpen}
        setOpen={setCharacterModalOpen}
        initialCharacter={characterModalInitialCharacter}
      />
      <SwitchRelicsModal
        onOk={onSwitchRelicsModalOk}
        open={isSwitchRelicsModalOpen}
        setOpen={setSwitchRelicsModalOpen}
        currentCharacter={selectedCharacter}
      />
      <NameBuild open={isSaveBuildModalOpen} setOpen={setIsSaveBuildModalOpen} onOk={confirmSaveBuild}/>
      <BuildsModal
        open={isBuildsModalOpen} setOpen={setIsBuildsModalOpen} selectedCharacter={selectedCharacter}
        imgRenderer={cellImageRenderer}
      />
      {contextHolder}
    </Flex>
  )
}
CharacterTab.propTypes = {
  active: PropTypes.bool,
}